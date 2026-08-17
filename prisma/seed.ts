import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@fieldtrack.local";
  const password = process.env.ADMIN_PASSWORD || "Admin@12345";
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.upsert({
    where: { email },
    update: {
      passwordHash,
      isSuper: true,
      accessLevel: "State",
      designations: ["State", "ZLC", "DLC", "Cluster", "ALC", "Sector Incharge"],
    },
    create: {
      email,
      passwordHash,
      name: "State Admin",
      isSuper: true,
      accessLevel: "State",
      designations: ["State", "ZLC", "DLC", "Cluster", "ALC", "Sector Incharge"],
    },
  });
  console.log("Admin ready:", email);
}

main().finally(() => prisma.$disconnect());
