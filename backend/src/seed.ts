import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { database } from "./db.js";
import { hashPassword } from "./security.js";
export async function seed(
  db: PrismaClient,
  adminPassword: string,
  staffPassword: string,
) {
  if (adminPassword.length < 12 || staffPassword.length < 12)
    throw new Error(
      "Runtime seed passwords must contain at least 12 characters",
    );
  const products = [
    {
      sku: "MILK001",
      barcode: "8931000000011",
      name: "Sữa tươi không đường 1L",
      price: 34000,
      onHand: 42,
    },
    {
      sku: "BREAD002",
      barcode: "8931000000028",
      name: "Bánh mì sandwich",
      price: 28000,
      onHand: 25,
    },
    {
      sku: "WATER003",
      barcode: "8931000000035",
      name: "Nước suối 500ml",
      price: 9000,
      onHand: 120,
    },
    {
      sku: "COFFEE004",
      barcode: "8931000000042",
      name: "Cà phê lon 240ml",
      price: 18000,
      onHand: 8,
    },
    {
      sku: "NOODLE005",
      barcode: "8931000000059",
      name: "Mì ăn liền",
      price: 7500,
      onHand: 0,
    },
    {
      sku: "LAST001",
      barcode: "0000000000001",
      name: "Sản phẩm cuối cùng để thử đồng thời",
      price: 10000,
      onHand: 1,
    },
  ];
  for (const { onHand, ...product } of products)
    await db.product.upsert({
      where: { sku: product.sku },
      create: { ...product, stock: { create: { onHand } } },
      update: {},
    });
  for (const [username, role, password] of [
    ["admin", "admin", adminPassword],
    ["staff", "staff", staffPassword],
  ])
    await db.user.upsert({
      where: { username },
      create: { username, role, passwordHash: hashPassword(password) },
      update: {},
    });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const db = database(process.env.DATABASE_URL || "");
  try {
    await seed(
      db,
      process.env.ADMIN_PASSWORD || "123456",
      process.env.STAFF_PASSWORD || "123456",
    );
    console.log("Seed complete; existing accounts and stock were preserved.");
  } finally {
    await db.$disconnect();
  }
}
