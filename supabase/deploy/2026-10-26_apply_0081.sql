-- 0081: Action Center types must always exist, and an alert must never block a business action.
-- Production returned UNKNOWN_ACTION_TYPE: order_request when an order was submitted (the type row
-- was missing), which made the whole Order Request fail. This (1) re-seeds every action type used by
-- the triggers (only missing ones are inserted) and (2) makes raise_action() register an unknown type
-- on the fly and never raise, so a failing alert can no longer abort an order, payment or sync.
-- Safe to re-run.

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
('payments_to_verify', 'Payments to Verify', 1, 'high', '/admin/acoes?type=payments_to_verify', false, 10),
  ('payment_difference', 'Payment Differences', 1, 'high', '/admin/acoes?type=payment_difference', true, 11),
  ('reserve_balance_due', 'Reserve Balance Due', 1, 'high', '/admin/envios-futuros?stage=balance_due', false, 12),
  ('customer_approval', 'Pending Wholesale Accounts', 2, 'normal', '/admin/clientes', false, 19),
  ('order_request', 'Order Requests', 2, 'high', '/admin/acoes?type=order_request', false, 20),
  ('stock_confirmation_pending', 'Stock Confirmation Pending', 2, 'high', '/admin/acoes?type=stock_confirmation_pending', false, 21),
  ('buyer_decision_pending', 'Buyer Decision/Substitution Pending', 2, 'normal', '/admin/acoes?type=buyer_decision_pending', false, 22),
  ('payment_coordination_required', 'Payment Coordination Required', 2, 'high', '/admin/acoes?type=payment_coordination_required', false, 23),
  ('expired_unpaid_order', 'Expired Unpaid Orders / Follow-up Required', 2, 'high', '/admin/acoes?type=expired_unpaid_order', true, 24),
  ('contact_message', 'Contact Messages', 2, 'normal', '/admin/contatos?status=new', false, 25),
  ('order_above_stock', 'Order above available stock', 2, 'high', '/admin/acoes?type=order_above_stock', true, 26),
  ('restock_opportunity', 'Restock Opportunities', 3, 'normal', '/admin/vendas-perdidas?status=restock_opportunity', false, 30),
  ('abandoned_carts', 'Abandoned Carts', 3, 'normal', '/admin/carrinhos', false, 31),
  ('restock_demand', 'Restock Demand (Notify Me)', 3, 'normal', '/admin/avise-me', false, 31),
  ('reserve_actions', 'Reserve Actions', 4, 'high', '/admin/acoes?type=reserve_actions', true, 40),
  ('ready_for_fulfillment', 'Ready for Fulfillment', 4, 'high', '/admin/acoes?type=ready_for_fulfillment', false, 41),
  ('dhl_quote_required', 'DHL Quote Required', 4, 'high', '/admin/acoes?type=dhl_quote_required', false, 42),
  ('dhl_shipping_actions', 'DHL / Shipping Actions', 4, 'high', '/admin/acoes?type=dhl_shipping_actions', false, 43),
  ('dhl_errors', 'DHL Errors', 4, 'critical', '/admin/acoes?type=dhl_errors', true, 44),
  ('export_documentation_required', 'Export Documentation / NF Number Required', 4, 'high', '/admin/acoes?type=export_documentation_required', false, 45),
  ('reserve_overdue', 'Reserve Overdue / Expired', 4, 'critical', '/admin/envios-futuros?stage=overdue', false, 46),
  ('chargeback_cancellation', 'Chargeback / Cancellation Actions', 5, 'critical', '/admin/acoes?type=chargeback_cancellation', true, 50),
  ('margin_below_target', 'Margin Below Target', 5, 'normal', '/admin/acoes?type=margin_below_target', false, 51),
  ('sync_issues', 'Sync Issues', 5, 'high', '/admin/acoes?type=sync_issues', true, 52),
  ('fx_update_failed', 'FX Update Failed', 5, 'high', '/admin/cambio', false, 53),
  ('volume_price_below_margin', 'VOLUME PRICE BELOW TARGET MARGIN', 5, 'normal', '/admin/volume-pricing', false, 54),
  ('products_to_review', 'Products to Review', 6, 'normal', '/admin/acoes?type=products_to_review', false, 60),
  ('category_review_required', 'Category Review Required', 6, 'normal', '/admin/acoes?type=category_review_required', false, 61),
  ('shipping_data_required', 'Shipping Data Required', 6, 'normal', '/admin/acoes?type=shipping_data_required', false, 62),
  ('images_to_review', 'Images to Review', 6, 'normal', '/admin/imagens', false, 63),
  ('content_to_review', 'Content to Review', 6, 'normal', '/admin/acoes?type=content_to_review', true, 64),
  ('colors_to_review', 'Colors to Review', 6, 'normal', '/admin/cores', false, 65),
  ('collection_low_stock', 'Collection Stock Alert', 6, 'normal', '/admin/colecoes', false, 66)
on conflict (code) do nothing;

create or replace function raise_action(
  p_type text,
  p_dedupe text,
  p_title text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_label text default null,
  p_subject text default null,
  p_value numeric default null,
  p_currency text default null,
  p_count integer default 1,
  p_href text default null,
  p_severity text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  t action_types;
  rid uuid;
  rate numeric;
begin
  select * into t from action_types where code = p_type;
  if t.code is null then
    insert into action_types (code, label, priority_group, default_severity, sort)
    values (p_type, initcap(replace(p_type, '_', ' ')), 6, 'normal', 999)
    on conflict (code) do nothing;
    select * into t from action_types where code = p_type;
  end if;
  if p_value is not null and p_currency is not null then
    rate := latest_brl_rate(p_currency);
  end if;

  insert into action_items (
    action_type, priority_group, severity, title, reference_type, reference_id, reference_label,
    subject_label, value_amount, value_currency, value_brl, affected_count, href, dedupe_key, metadata
  ) values (
    p_type, t.priority_group, coalesce(p_severity, t.default_severity), p_title, p_reference_type,
    p_reference_id, p_reference_label, p_subject, p_value, p_currency,
    case when rate is not null then round(p_value * rate, 2) end,
    coalesce(p_count, 1), p_href, p_dedupe, p_metadata
  )
  on conflict (dedupe_key) where status = 'open' do update set
    title = excluded.title,
    severity = excluded.severity,
    reference_label = excluded.reference_label,
    subject_label = excluded.subject_label,
    value_amount = excluded.value_amount,
    value_currency = excluded.value_currency,
    value_brl = excluded.value_brl,
    affected_count = excluded.affected_count,
    href = excluded.href,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into rid;
  return rid;
exception when others then
  -- an alert is secondary: never abort the caller's transaction because of it
  raise warning 'raise_action(%) failed: %', p_type, sqlerrm;
  return null;
end;
$$;

revoke execute on function raise_action(text, text, text, text, uuid, text, text, numeric, text, integer, text, text, jsonb) from public;
grant execute on function raise_action(text, text, text, text, uuid, text, text, numeric, text, integer, text, text, jsonb) to service_role;
