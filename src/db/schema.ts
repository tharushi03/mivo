import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
  primaryKey,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const roleEnum = pgEnum("role", ["ADMIN", "SELLER", "BUYER"]);
export const paymentMethodEnum = pgEnum("payment_method", ["BANK_TRANSFER", "COD"]);
// VOIDED = cancelled before any money was received. REFUND_PENDING = cancelled after
// the buyer paid (or uploaded a slip): MIVO owes a refund. REFUNDED = refund sent.
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "PAID", "FAILED", "VOIDED", "REFUND_PENDING", "REFUNDED"]);
// Derived from the order's shipments (see syncOrderStatus in actions/admin-orders.ts):
//   PENDING               no package sent yet
//   PARTIALLY_DISPATCHED  some boutiques have sent their package
//   DISPATCHED            every package sent
//   DELIVERED             every package delivered
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PARTIALLY_DISPATCHED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
]);
export const payoutStatusEnum = pgEnum("payout_status", ["PENDING", "PAID"]);
// One package per boutique per order.
// RETURNED = delivered, then sent back by the buyer (refunded, not paid out to the boutique).
export const shipmentStatusEnum = pgEnum("shipment_status", ["PENDING", "DISPATCHED", "DELIVERED", "CANCELLED", "RETURNED"]);
export const refundStatusEnum = pgEnum("refund_status", ["PENDING", "REFUNDED", "VOIDED"]);

// ---------- 1. Users ----------
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  // Nullable so Auth.js OAuth (e.g. Google) users can exist without a password.
  passwordHash: text("password_hash"),
  role: roleEnum("role").default("BUYER").notNull(),
  // Sessions issued before this moment are rejected (set on password reset).
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: "date" }),
  // Suspended accounts can't log in; open sessions stop working; a suspended
  // boutique's products disappear from the shop.
  suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
  suspendReason: varchar("suspend_reason", { length: 255 }),
  // Required by the Auth.js Drizzle adapter (used for OAuth logins later).
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Auth.js tables (OAuth accounts, DB sessions, email tokens) ----------
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------- 2. Seller Profiles (Boutiques) ----------
export const sellerProfiles = pgTable("seller_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  shopName: varchar("shop_name", { length: 255 }).notNull(),
  instagramUrl: varchar("instagram_url", { length: 255 }),
  // Where MIVO sends this boutique's payouts. Set by the seller on /seller/settings.
  bankName: varchar("bank_name", { length: 100 }),
  bankBranch: varchar("bank_branch", { length: 100 }),
  bankAccountName: varchar("bank_account_name", { length: 255 }),
  bankAccountNumber: varchar("bank_account_number", { length: 100 }),
  bankDetailsUpdatedAt: timestamp("bank_details_updated_at", { withTimezone: true }),
  // Platform commission for this seller, as a percentage (e.g. 10.00 = 10%).
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).default("10.00").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(), // Admin must approve
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- 3. Products (Clothes) ----------
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerId: uuid("seller_id")
      .references(() => sellerProfiles.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(), // LKR
    category: varchar("category", { length: 100 }), // e.g. "Dresses", "Tops", "Batik"
    // Sizes and stock live in product_variants (one row per size).
    imageUrl: text("image_url").notNull(), // Cloudflare R2 URL later
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("products_seller_idx").on(t.sellerId), index("products_category_idx").on(t.category)],
);

// ---------- 3b. Product Variants (stock per size) ----------
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    size: varchar("size", { length: 20 }).notNull(), // e.g. "S", "M", "FREE SIZE"
    stock: integer("stock").default(0).notNull(),
    position: integer("position").default(0).notNull(), // display order (S before M before L)
  },
  (t) => [
    uniqueIndex("product_variants_product_size_idx").on(t.productId, t.size),
    // Last line of defence: the database itself refuses negative stock.
    check("product_variants_stock_non_negative", sql`${t.stock} >= 0`),
  ],
);

// ---------- 4. Orders ----------
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerId: uuid("buyer_id")
      .references(() => users.id)
      .notNull(),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(), // items + delivery
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("0").notNull(), // sum of the shipments' fees

    // Shipping
    recipientName: varchar("recipient_name", { length: 255 }).notNull(),
    shippingAddress: text("shipping_address").notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),

    // Payment
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").default("PENDING").notNull(),
    paymentSlipUrl: text("payment_slip_url"), // Bank transfer slip

    // Status: derived from the shipments (each boutique ships its own package).
    orderStatus: orderStatusEnum("order_status").default("PENDING").notNull(),
    // When each step happened (null = not yet). dispatchedAt/deliveredAt = when the LAST package was.
    paidAt: timestamp("paid_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: roleEnum("cancelled_by"), // BUYER (before any package left) or ADMIN
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    cancelReason: varchar("cancel_reason", { length: 255 }), // e.g. "Not paid within 3 days"
    paymentReminderSentAt: timestamp("payment_reminder_sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("orders_buyer_idx").on(t.buyerId), index("orders_status_idx").on(t.orderStatus)],
);

// ---------- 5. Order Items ----------
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    quantity: integer("quantity").default(1).notNull(),
    priceAtPurchase: numeric("price_at_purchase", { precision: 10, scale: 2 }).notNull(),
    selectedSize: varchar("selected_size", { length: 20 }).notNull(),
    // Snapshots taken at checkout, so invoices and order history never change when
    // the boutique later renames the product, replaces its photo or its commission changes.
    productTitle: varchar("product_title", { length: 255 }).notNull(),
    productImageUrl: text("product_image_url").notNull(),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
    // The payout that paid the boutique for this item. NULL = not paid out yet.
    // An item can belong to at most one payout, so a boutique can't be paid twice.
    payoutId: uuid("payout_id").references(() => sellerPayouts.id),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    index("order_items_payout_idx").on(t.payoutId),
  ],
);

// ---------- 5b. Couriers ----------
export const couriers = pgTable("couriers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(), // inactive = hidden from the dispatch dropdown
  sortOrder: integer("sort_order").default(0).notNull(),
  // MIVO's merchant account with this courier. COD cash is paid to whoever owns the
  // account a parcel is booked on, so cash-on-delivery packages may only use couriers
  // where MIVO has one (supportsCod). Shown to every boutique: never a password.
  supportsCod: boolean("supports_cod").default(false).notNull(),
  accountNumber: varchar("account_number", { length: 60 }),
  bookingInstructions: text("booking_instructions"),
});

// ---------- 5c. Shipments ----------
// Distributed fulfilment: each boutique ships its part of an order directly to the
// buyer. One row per boutique per order, created PENDING when the order is placed.
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => sellerProfiles.id)
      .notNull(),
    status: shipmentStatusEnum("status").default("PENDING").notNull(),
    courierId: uuid("courier_id").references(() => couriers.id), // set when dispatched
    trackingNumber: varchar("tracking_number", { length: 100 }),
    // Delivery fee the buyer paid for THIS package (LKR 400 per boutique).
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("0").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    // Cancelled / returned packages: when their items went back into stock (once only).
    // Null on such a package = the items are still with the courier or the buyer.
    restockedAt: timestamp("restocked_at", { withTimezone: true }),
    // Why MIVO cancelled or returned this one package (shown to the boutique and buyer).
    resolutionNote: varchar("resolution_note", { length: 255 }),
    // Prepaid orders: the boutique paid the courier itself, so the payout repays this
    // package's delivery fee. Set when that reimbursement is paid (at most once).
    payoutId: uuid("payout_id").references(() => sellerPayouts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("shipments_order_seller_idx").on(t.orderId, t.sellerId),
    index("shipments_seller_status_idx").on(t.sellerId, t.status),
    index("shipments_status_created_idx").on(t.status, t.createdAt),
  ],
);

// ---------- 6. Seller Payouts ----------
// One row per transfer from MIVO to a boutique. The amounts are a snapshot taken
// when the payout is recorded, so later commission-rate changes don't rewrite history.
export const sellerPayouts = pgTable(
  "seller_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerId: uuid("seller_id")
      .references(() => sellerProfiles.id)
      .notNull(),
    grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(), // items sold
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(), // % at payout time
    commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }).notNull(),
    // Delivery fees repaid for prepaid packages the boutique sent at its own cost.
    deliveryAmount: numeric("delivery_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    // Deductions taken from this payout (negative), e.g. a return after the boutique was paid.
    adjustmentAmount: numeric("adjustment_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // net paid: gross - commission + delivery
    itemCount: integer("item_count").notNull(),
    status: payoutStatusEnum("status").default("PENDING").notNull(),
    reference: varchar("reference", { length: 100 }), // bank transfer reference, optional
    // The account the money was sent to, as shown to the admin at the time.
    bankName: varchar("bank_name", { length: 100 }),
    bankAccountName: varchar("bank_account_name", { length: 255 }),
    bankAccountNumber: varchar("bank_account_number", { length: 100 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("seller_payouts_seller_idx").on(t.sellerId)],
);

// ---------- 6a. Boutique adjustments ----------
// Money moved in or out of a boutique's balance outside normal sales. Today: a package
// returned AFTER the boutique was paid for it -> a negative amount, deducted from the
// next payout(s). payoutId is set when a payout takes it into account.
export const sellerAdjustments = pgTable(
  "seller_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerId: uuid("seller_id")
      .references(() => sellerProfiles.id)
      .notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // negative = boutique owes MIVO
    reason: varchar("reason", { length: 255 }).notNull(),
    shipmentId: uuid("shipment_id").references(() => shipments.id, { onDelete: "set null" }),
    payoutId: uuid("payout_id").references(() => sellerPayouts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("seller_adjustments_seller_idx").on(t.sellerId), uniqueIndex("seller_adjustments_shipment_idx").on(t.shipmentId)],
);

// ---------- 6c. Admin activity log ----------
// Who did what in the admin area (payments verified, packages delivered, payouts,
// refunds, approvals, suspensions, ...). Append-only.
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .references(() => users.id)
      .notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    targetType: varchar("target_type", { length: 30 }).notNull(),
    targetId: varchar("target_id", { length: 64 }),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("admin_actions_created_idx").on(t.createdAt), index("admin_actions_target_idx").on(t.targetType, t.targetId)],
);

// ---------- 6b. Refunds ----------
// Money MIVO owes a buyer: a whole cancelled order (shipmentId null) or one
// cancelled / returned package. Settled by hand after the bank transfer is sent.
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    shipmentId: uuid("shipment_id").references(() => shipments.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: refundStatusEnum("status").default("PENDING").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    reference: varchar("reference", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    index("refunds_order_idx").on(t.orderId),
    index("refunds_status_idx").on(t.status),
    uniqueIndex("refunds_shipment_idx").on(t.shipmentId), // one refund per package (NULLs don't clash)
  ],
);

// ---------- 7. Reviews ----------
// Only buyers whose order containing the product was DELIVERED can review it
// (checked in submitReview). One review per buyer per product; submitting again
// updates it.
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(), // the delivered order that proves the purchase
    rating: integer("rating").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("reviews_buyer_product_idx").on(t.buyerId, t.productId),
    index("reviews_product_created_idx").on(t.productId, t.createdAt),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);

// ---------- Relations (for db.query.* with `with`) ----------
export const usersRelations = relations(users, ({ one, many }) => ({
  sellerProfile: one(sellerProfiles, {
    fields: [users.id],
    references: [sellerProfiles.userId],
  }),
  orders: many(orders),
}));

export const sellerProfilesRelations = relations(sellerProfiles, ({ one, many }) => ({
  user: one(users, { fields: [sellerProfiles.userId], references: [users.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(sellerProfiles, { fields: [products.sellerId], references: [sellerProfiles.id] }),
  orderItems: many(orderItems),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  buyer: one(users, { fields: [orders.buyerId], references: [users.id] }),
  items: many(orderItems),
  shipments: many(shipments),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  seller: one(sellerProfiles, { fields: [shipments.sellerId], references: [sellerProfiles.id] }),
  courier: one(couriers, { fields: [shipments.courierId], references: [couriers.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

// ---------- Inferred types ----------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SellerProfile = typeof sellerProfiles.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type Courier = typeof couriers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
