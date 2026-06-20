import { queryOne } from "./shared/db/db.js";
import { hashPassword } from "./shared/security/passwords.js";

const email = process.argv[2] || process.env.ADMIN_EMAIL;
const password = process.argv[3] || process.env.ADMIN_INITIAL_PASSWORD;

if (!email || !password) {
  console.error("Использование: npm run admin:create -- admin@example.com strong-password");
  process.exit(1);
}

const run = async () => {
  const passwordHash = await hashPassword(password);
  const user = await queryOne<{ id: number; email: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin',
           updated_at = NOW()
     RETURNING id, email`,
    [email, passwordHash]
  );
  console.log(`Администратор готов: ${user.email}`);
};

run().catch((error) => {
  console.error("Не удалось создать администратора:", error);
  process.exitCode = 1;
});
