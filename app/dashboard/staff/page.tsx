import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import Select from "@/components/Select";
import { addUser, deleteUser, resetPassword } from "./actions";

const input = "rounded-lg border border-neutral-200 px-3 py-2 text-sm";

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Gli account che possono accedere alla gestione del locale.
        </p>
      </div>

      {isOwner ? (
        <form
          action={addUser}
          className="grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <div className="font-medium sm:col-span-2">Aggiungi membro</div>
          <input name="email" type="email" placeholder="Email" required className={input} />
          <input
            name="password"
            type="password"
            placeholder="Password (min 6 caratteri)"
            required
            minLength={6}
            className={input}
          />
          <Select
            name="role"
            options={[
              { value: "staff", label: "Staff" },
              { value: "owner", label: "Titolare" },
            ]}
          />
          <button className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm text-[var(--brand-on)]">
            Aggiungi
          </button>
        </form>
      ) : (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
          Solo il titolare può aggiungere o rimuovere account.
        </p>
      )}

      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {list.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <div className="font-medium">
                {u.email}
                {u.id === session.userId && (
                  <span className="ml-2 rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-xs text-[var(--brand-text)]">
                    tu
                  </span>
                )}
              </div>
              <div className="text-sm text-neutral-500">
                {u.role === "owner" ? "Titolare" : "Staff"}
              </div>
            </div>

            {isOwner && u.id !== session.userId && (
              <div className="flex items-center gap-2">
                <form action={resetPassword} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={u.id} />
                  <input
                    name="password"
                    type="password"
                    placeholder="Nuova password"
                    className="w-36 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs"
                  />
                  <button className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs hover:bg-neutral-50">
                    Reimposta
                  </button>
                </form>
                <form action={deleteUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">
                    Elimina
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
