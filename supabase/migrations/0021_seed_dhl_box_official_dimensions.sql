-- ---------------------------------------------------------------------
-- Seed Official DHL Box Dimensions & Capacity Rules
-- ---------------------------------------------------------------------

update packaging_types
set length_cm = 33.0, width_cm = 24.0, height_cm = 10.0, empty_weight_kg = 0.20, max_weight_kg = 5.00
where code = 'DHL_PACKAGE_1';

update packaging_types
set length_cm = 38.0, width_cm = 32.0, height_cm = 25.0, empty_weight_kg = 0.40, max_weight_kg = 10.00
where code = 'DHL_PACKAGE_2';

update packaging_types
set length_cm = 54.0, width_cm = 44.0, height_cm = 41.0, empty_weight_kg = 1.00, max_weight_kg = 30.00
where code = 'DHL_BOX_8';
