import AdminLoginForm from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-semibold">Comanda · Super-admin</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Accesso gestore del servizio
      </p>
      <AdminLoginForm />
    </main>
  );
}
