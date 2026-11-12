// Invoice PDF layout. @react-pdf/renderer has its own layout engine: it does NOT
// use Tailwind or CSS files, only StyleSheet.create() below. Rendered on the
// server by src/app/api/invoice/[orderId]/route.ts.
import type { ReactElement } from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { getOrderWithItems } from "@/lib/orders";

type InvoiceOrder = NonNullable<Awaited<ReturnType<typeof getOrderWithItems>>>;

// MIVO brand colours (same values as globals.css)
const C = {
  ink: "#171717",
  accent: "#C87959",
  accentDark: "#AD6347",
  cream: "#FAF7F2",
  muted: "#E9E1D8",
  grey: "#77716B",
  success: "#667C68",
  error: "#C94C4C",
};

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: C.ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 6 },
  tagline: { fontSize: 8.5, color: C.grey, marginTop: 3 },
  invoiceTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "right", color: C.accentDark },
  meta: { marginTop: 6, textAlign: "right", lineHeight: 1.25 },
  label: { color: C.grey, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  rule: { height: 2, backgroundColor: C.accent, marginTop: 18, marginBottom: 18 },
  parties: { flexDirection: "row", gap: 24, marginBottom: 22 },
  party: { flex: 1, lineHeight: 1.25 },
  bold: { fontFamily: "Helvetica-Bold" },
  tableHead: { flexDirection: "row", backgroundColor: C.cream, borderBottomWidth: 1, borderColor: C.muted, paddingVertical: 7, paddingHorizontal: 8 },
  th: { fontSize: 8, color: C.grey, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.muted, paddingVertical: 8, paddingHorizontal: 8 },
  colItem: { flex: 4 },
  colSize: { flex: 1.2 },
  colQty: { flex: 0.8, textAlign: "right" },
  colPrice: { flex: 1.6, textAlign: "right" },
  colAmount: { flex: 1.6, textAlign: "right" },
  shop: { fontSize: 8, color: C.grey, marginTop: 2 },
  totals: { marginTop: 14, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderColor: C.ink },
  grandText: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  payment: { marginTop: 26, padding: 12, backgroundColor: C.cream, borderRadius: 4, lineHeight: 1.3 },
  badge: { alignSelf: "flex-end", marginTop: 8, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#FFFFFF", letterSpacing: 0.8 },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.grey, borderTopWidth: 1, borderColor: C.muted, paddingTop: 8 },
});

// Built-in PDF fonts can't draw every Unicode character, so keep money plain ASCII.
const money = (v: number | string) =>
  "LKR " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Colombo" });

/** Renders the invoice to PDF bytes. */
export function renderInvoicePdf(order: InvoiceOrder, invoiceNumber: string) {
  // InvoiceDocument returns a <Document>, but react-pdf's types only accept a
  // <Document> element directly, hence the cast.
  const element = <InvoiceDocument order={order} invoiceNumber={invoiceNumber} />;
  return renderToBuffer(element as ReactElement<DocumentProps>);
}

export function InvoiceDocument({ order, invoiceNumber }: { order: InvoiceOrder; invoiceNumber: string }) {
  const subtotal = Number(order.totalAmount) - Number(order.deliveryFee);
  const status =
    order.orderStatus === "CANCELLED"
      ? { text: "CANCELLED", color: C.error }
      : order.paymentStatus === "PAID"
        ? { text: "PAID", color: C.success }
        : { text: order.paymentMethod === "COD" ? "PAY ON DELIVERY" : "PAYMENT PENDING", color: C.accent };

  return (
    <Document title={`Invoice ${invoiceNumber}`} author="MIVO" subject={`MIVO order ${invoiceNumber}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>MIVO</Text>
            <Text style={s.tagline}>Curated clothing from Sri Lankan boutiques</Text>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <View style={s.meta}>
              <Text>
                <Text style={s.bold}>Invoice no: </Text>
                {invoiceNumber}
              </Text>
              <Text>
                <Text style={s.bold}>Date: </Text>
                {date(order.createdAt)}
              </Text>
              <Text style={{ fontSize: 7.5, color: C.grey }}>Order ID: {order.id}</Text>
            </View>
            <Text style={[s.badge, { backgroundColor: status.color }]}>{status.text}</Text>
          </View>
        </View>

        <View style={s.rule} />

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>Billed to</Text>
            <Text style={s.bold}>{order.buyerName}</Text>
            <Text>{order.buyerEmail}</Text>
          </View>
          <View style={s.party}>
            <Text style={s.label}>Deliver to</Text>
            <Text style={s.bold}>{order.recipientName}</Text>
            <Text>{order.shippingAddress}</Text>
            <Text>{order.phoneNumber}</Text>
          </View>
          <View style={s.party}>
            <Text style={s.label}>Payment</Text>
            <Text>{order.paymentMethod === "COD" ? "Cash on Delivery" : "Bank Transfer"}</Text>
            {order.paidAt && <Text>Paid on {date(order.paidAt)}</Text>}
          </View>
        </View>

        <View style={s.tableHead} fixed>
          <Text style={[s.th, s.colItem]}>Item</Text>
          <Text style={[s.th, s.colSize]}>Size</Text>
          <Text style={[s.th, s.colQty]}>Qty</Text>
          <Text style={[s.th, s.colPrice]}>Unit price</Text>
          <Text style={[s.th, s.colAmount]}>Amount</Text>
        </View>
        {order.items.map((i) => (
          <View key={i.id} style={s.row} wrap={false}>
            <View style={s.colItem}>
              <Text style={s.bold}>{i.title}</Text>
              <Text style={s.shop}>Sold by {i.shopName}</Text>
            </View>
            <Text style={s.colSize}>{i.size}</Text>
            <Text style={s.colQty}>{i.quantity}</Text>
            <Text style={s.colPrice}>{money(i.price)}</Text>
            <Text style={s.colAmount}>{money(Number(i.price) * i.quantity)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: C.grey }}>Subtotal</Text>
            <Text>{money(subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: C.grey }}>
              Delivery ({order.packages.length} {order.packages.length === 1 ? "package" : "packages"})
            </Text>
            <Text>{money(order.deliveryFee)}</Text>
          </View>
          <View style={s.grandTotal}>
            <Text style={s.grandText}>Total</Text>
            <Text style={s.grandText}>{money(order.totalAmount)}</Text>
          </View>
        </View>

        <View style={s.payment} wrap={false}>
          <Text style={s.bold}>Thank you for shopping with MIVO.</Text>
          <Text style={{ color: C.grey }}>
            {order.packages.length > 1
              ? `Each boutique ships its own package, so your ${order.packages.length} packages may arrive separately.`
              : "Your package is shipped directly by the boutique."}
          </Text>
          {order.packages
            .filter((p) => p.trackingNumber)
            .map((p) => (
              <Text key={p.id} style={{ color: C.grey }}>
                {p.shopName}: {p.courierName} {p.trackingNumber}
              </Text>
            ))}
        </View>

        <View style={s.footer} fixed>
          <Text>MIVO  |  Invoice {invoiceNumber}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
