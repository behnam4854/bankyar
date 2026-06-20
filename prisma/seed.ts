// Seed demo data: one customer with accounts/transactions, plus a Persian
// FAQ knowledge base for the RAG retriever.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

const FAQ: { slug: string; title: string; category: string; body: string }[] = [
  {
    slug: "branch-hours",
    title: "ساعت کاری شعب",
    category: "عمومی",
    body: "ساعت کاری شعب بانک از شنبه تا چهارشنبه از ۷:۳۰ تا ۱۳:۳۰ و پنجشنبه‌ها از ۷:۳۰ تا ۱۲:۳۰ است. در روزهای تعطیل رسمی شعب بسته هستند، اما خدمات اینترنت‌بانک و همراه‌بانک به صورت ۲۴ ساعته در دسترس‌اند.",
  },
  {
    slug: "dynamic-password",
    title: "رمز پویا (رمز یکبارمصرف)",
    category: "کارت",
    body: "رمز پویا یک رمز یکبارمصرف برای خریدهای اینترنتی است که هر بار تغییر می‌کند و حدود ۶۰ ثانیه اعتبار دارد. برای فعال‌سازی می‌توانید از طریق همراه‌بانک، خودپرداز یا اپلیکیشن رمزساز اقدام کنید. اگر رمز پویا دریافت نمی‌کنید، شماره موبایل ثبت‌شده در بانک و فعال بودن سرویس را بررسی کنید.",
  },
  {
    slug: "block-card",
    title: "مسدود کردن کارت",
    category: "کارت",
    body: "در صورت مفقودی یا سرقت کارت، بلافاصله از طریق مرکز ارتباط مشتریان ۱۵۵۴، اینترنت‌بانک یا همراه‌بانک نسبت به مسدودسازی کارت اقدام کنید. پس از مسدودسازی، صدور کارت جدید از طریق شعبه امکان‌پذیر است.",
  },
  {
    slug: "card-to-card",
    title: "انتقال کارت به کارت و سقف آن",
    category: "انتقال وجه",
    body: "انتقال کارت به کارت از طریق همراه‌بانک و خودپرداز انجام می‌شود. سقف انتقال کارت به کارت روزانه طبق مقررات بانک مرکزی تعیین می‌شود. برای مبالغ بالاتر می‌توانید از انتقال پایا یا ساتنا از طریق اینترنت‌بانک استفاده کنید.",
  },
  {
    slug: "internet-bank-activation",
    title: "فعال‌سازی اینترنت‌بانک",
    category: "خدمات الکترونیک",
    body: "برای فعال‌سازی اینترنت‌بانک ابتدا در سامانه خدمات غیرحضوری ثبت‌نام کنید، سپس با نام کاربری و رمز خود وارد درگاه اینترنت‌بانک شوید. در صورت فراموشی رمز، از گزینه بازیابی رمز عبور استفاده کنید.",
  },
  {
    slug: "iban",
    title: "شماره شبا (IBAN)",
    category: "حساب",
    body: "شماره شبا یک شناسه ۲۴ رقمی است که با IR آغاز می‌شود و برای انتقال‌های پایا و ساتنا استفاده می‌شود. شماره شبای حساب خود را می‌توانید از طریق اینترنت‌بانک، همراه‌بانک یا روی برگه حساب مشاهده کنید.",
  },
  {
    slug: "loan-installments",
    title: "اقساط تسهیلات",
    category: "تسهیلات",
    body: "مبلغ و تعداد اقساط تسهیلات بر اساس مبلغ وام، نرخ سود و مدت بازپرداخت محاسبه می‌شود. پرداخت اقساط را می‌توانید به صورت خودکار از حساب یا از طریق همراه‌بانک انجام دهید. تأخیر در پرداخت اقساط مشمول جریمه می‌شود.",
  },
  {
    slug: "contact-center",
    title: "مرکز ارتباط مشتریان",
    category: "پشتیبانی",
    body: "مرکز ارتباط مشتریان به صورت شبانه‌روزی از طریق شماره ۱۵۵۴ پاسخگوی شماست. خدماتی مانند اطلاع‌رسانی، پشتیبانی فنی و ثبت شکایات از این طریق ارائه می‌شود.",
  },
];

async function main() {
  // Clean (order matters for FKs).
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.kbChunk.deleteMany();
  await prisma.kbDoc.deleteMany();
  await prisma.customer.deleteMany();

  const customer = await prisma.customer.create({
    data: {
      mobile: "09120000000",
      name: "کاربر نمونه",
      passwordHash: hashPassword("1234"),
    },
  });

  const current = await prisma.account.create({
    data: {
      customerId: customer.id,
      iban: "IR120000000000000000000001",
      cardNumber: "6037990000000001",
      type: "current",
      balance: "200000000", // 200,000,000 ریال = 20,000,000 تومان
    },
  });

  await prisma.account.create({
    data: {
      customerId: customer.id,
      iban: "IR120000000000000000000002",
      cardNumber: "6037990000000002",
      type: "savings",
      balance: "500000000",
    },
  });

  await prisma.transaction.createMany({
    data: [
      {
        customerId: customer.id,
        accountId: current.id,
        type: "transfer",
        amount: "10000000",
        destination: "6037991111111111",
        status: "completed",
        idempotencyKey: "seed-tx-1",
      },
      {
        customerId: customer.id,
        accountId: current.id,
        type: "billpay",
        amount: "2500000",
        destination: "bill-123",
        status: "completed",
        idempotencyKey: "seed-tx-2",
      },
    ],
  });

  for (const f of FAQ) {
    const doc = await prisma.kbDoc.create({ data: f });
    await prisma.kbChunk.create({ data: { docId: doc.id, content: f.body } });
  }

  console.log("Seed complete:");
  console.log("  login -> mobile: 09120000000  password: 1234");
  console.log(`  ${FAQ.length} FAQ docs, 2 accounts, 2 transactions`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
