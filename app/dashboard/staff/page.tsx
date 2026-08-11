import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import Select from "@/components/Select";
import Field from "@/components/Field";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { addUser, deleteUser, resetPassword } from "./actions";

export default async function StaffPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const isOwner = session.role === "owner";
  const list = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.tenantId, session.tenantId))
    .orderBy(asc(users.email));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Gli account che possono accedere alla gestione del locale.
        </p>
      </div>

      {isOwner ? (
        <details className="disclosure">
          <summary>Aggiungi un membro</summary>
          <div className="disclosure-body">
            <form action={addUser} className="grid gap-3 sm:grid-cols-2">
              <Field label="Email *">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="nome@locale.it"
                  className="input"
                />
              </Field>
              <Field label="Password *" hint="Almeno 6 caratteri">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="input"
                />
              </Field>
              <Field
                label="Ruolo"
                hint="Il titolare può gestire gli account, lo staff no."
              >
                <Select
                  name="role"
                  options={[
                    { value: "staff", label: "Staff" },
                    { value: "owner", label: "Titolare" },
                  ]}
                />
              </Field>
              <div className="flex items-end">
                <button className="btn btn-primary">Aggiungi</button>
              </div>
            </form>
          </div>
        </details>
      ) : (
        <p className="card p-4 text-sm" style={{ color: "var(--muted)" }}>
          Solo il titolare può aggiungere o rimuovere account.
        </p>
      )}

      <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
        {list.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.email}</span>
                {u.id === session.userId && (
                  <span className="badge badge-brand">tu</span>
                )}
              </div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {u.role === "owner" ? "Titolare" : "Staff"}
              </div>
            </div>

            {isOwner && u.id !== session.userId && (
              <div className="flex flex-wrap items-center gap-2">
                <form action={resetPassword} className="flex items-end gap-1.5">
                  <input type="hidden" name="id" value={u.id} />
                  <Field label="Nuova password">
                    <input
                      name="password"
                      type="password"
                      minLength={6}
                      aria-label={`Nuova password per ${u.email}`}
                      className="input w-40"
                    />
                  </Field>
                  <button className="btn btn-sm">Reimposta</button>
                </form>
                <form action={deleteUser} className="self-end">
                  <input type="hidden" name="id" value={u.id} />
                  <ConfirmSubmit
                    label="Elimina"
                    ariaLabel={`Elimina l'account ${u.email}`}
                  />
                </form>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ha senso solo quando c'e' davvero un account da reimpostare. */}
      {isOwner && list.length > 1 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Reimpostare la password disconnette subito quell&apos;account da tutti
          i dispositivi.
        </p>
      )}
    </div>
  );
}
