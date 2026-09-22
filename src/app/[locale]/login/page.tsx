import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-8">Entrar</h1>
      <LoginForm />
    </div>
  );
}
