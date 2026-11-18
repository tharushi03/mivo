// Packing slip: a till-style receipt for ONE boutique's package, printed on an 80mm
// thermal printer (or A4) and put inside the parcel while packing. Rendered on the
// server by src/app/api/packing-slip/[shipmentId]/route.ts.
//
// Prices are what the buyer paid (MIVO commission included). Commission and payout
// figures are internal and never appear here.
import type { ReactElement } from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { SITE } from "@/lib/site";

export type PackingSlip = {
  orderRef: string;
  orderedAt: Date;
  shopName: string;
  recipientName: string;
  paymentMethod: "COD" | "BANK_TRANSFER";
  /** true = bank transfer verified (or COD cash already in): nothing to collect. */
  paid: boolean;
  deliveryFee: string;
  items: { title: string; size: string; quantity: number; price: string }[];
};

// 80mm paper, about 72mm printable. 1mm = 2.835pt.
const WIDTH = 80 * 2.835;
const PAD = 12;
const FONT = 8;
// Courier: every character is 0.6em wide, so we know how many fit on a line.
const CHARS_PER_LINE = Math.floor((WIDTH - PAD * 2) / (FONT * 0.6));

// Wrap long product names at spaces instead of splitting words ("Neck-line").
// This setting is global to react-pdf, so it applies to the invoice too.
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { paddingVertical: 14, paddingHorizontal: PAD, fontFamily: "Courier", fontSize: FONT, color: "#000000" },
  center: { textAlign: "center" },
  brand: { fontFamily: "Courier-Bold", fontSize: 18, letterSpacing: 4, textAlign: "center" },
  bold: { fontFamily: "Courier-Bold" },
  rule: { borderBottomWidth: 0.8, borderStyle: "dashed", borderColor: "#000000", marginVertical: 6 },
  double: { borderBottomWidth: 2, borderColor: "#000000", marginVertical: 6 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  item: { marginBottom: 4 },
  itemLine: { flexDirection: "row", justifyContent: "space-between", paddingLeft: FONT * 1.2 },
  big: { fontFamily: "Courier-Bold", fontSize: 11, textAlign: "center" },
  box: { borderWidth: 1.5, borderColor: "#000000", paddingVertical: 5, paddingHorizontal: 4, marginVertical: 4 },
});

// Built-in PDF fonts can't draw every Unicode character, so keep money plain ASCII.
const num = (v: number | string) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });

/** Page height for the content, so a thermal printer doesn't feed metres of blank paper. */
function pageHeight(slip: PackingSlip) {
  const lines = (t: string) => Math.max(1, Math.ceil(t.length / CHARS_PER_LINE));
  const itemLines = slip.items.reduce((n, i) => n + lines(i.title) + 1, 0);
  const lineHeight = FONT * 1.25;
  // Fixed parts: header, totals, payment box, footer (measured from the layout below, plus a margin).
  return Math.ceil(320 + lines(slip.shopName) * lineHeight + itemLines * lineHeight + slip.items.length * 4);
}

export function renderPackingSlipPdf(slip: PackingSlip) {
  // react-pdf's types only accept a <Document> element directly, hence the cast.
  const element = <PackingSlipDocument slip={slip} />;
  return renderToBuffer(element as ReactElement<DocumentProps>);
}

export function PackingSlipDocument({ slip }: { slip: PackingSlip }) {
  const itemsTotal = slip.items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const total = itemsTotal + Number(slip.deliveryFee);
  const pieces = slip.items.reduce((n, i) => n + i.quantity, 0);
  const collectCash = slip.paymentMethod === "COD" && !slip.paid;

  return (
    <Document title={`Packing slip ${slip.orderRef}`} author="MIVO" subject={`MIVO order ${slip.orderRef}`}>
      <Page size={[WIDTH, pageHeight(slip)]} style={s.page}>
        <Text style={s.brand}>MIVO</Text>
        <Text style={s.center}>Curated Sri Lankan boutiques</Text>
        <View style={s.double} />

        <View style={s.row}>
          <Text>ORDER</Text>
          <Text style={s.bold}>{slip.orderRef}</Text>
        </View>
        <View style={s.row}>
          <Text>DATE</Text>
          <Text>{when(slip.orderedAt)}</Text>
        </View>
        <Text>BOUTIQUE: {slip.shopName}</Text>
        <Text>FOR: {slip.recipientName}</Text>

        <View style={s.rule} />
        <View style={s.row}>
          <Text style={s.bold}>ITEM</Text>
          <Text style={s.bold}>LKR</Text>
        </View>
        <View style={s.rule} />

        {slip.items.map((i, n) => (
          <View key={n} style={s.item} wrap={false}>
            <Text>{i.title}</Text>
            <View style={s.itemLine}>
              <Text>
                Size {i.size}  {i.quantity} x {num(i.price)}
              </Text>
              <Text>{num(Number(i.price) * i.quantity)}</Text>
            </View>
          </View>
        ))}

        <View style={s.rule} />
        <View style={s.row}>
          <Text>Items ({pieces})</Text>
          <Text>{num(itemsTotal)}</Text>
        </View>
        <View style={s.row}>
          <Text>Delivery</Text>
          <Text>{num(slip.deliveryFee)}</Text>
        </View>
        <View style={s.double} />
        <View style={s.row}>
          <Text style={[s.bold, { fontSize: 10 }]}>TOTAL</Text>
          <Text style={[s.bold, { fontSize: 10 }]}>LKR {num(total)}</Text>
        </View>

        <View style={s.box}>
          {collectCash ? (
            <>
              <Text style={s.big}>CASH ON DELIVERY</Text>
              <Text style={[s.big, { marginTop: 2 }]}>PAY COURIER: LKR {num(total)}</Text>
            </>
          ) : (
            <>
              <Text style={s.big}>PAID</Text>
              <Text style={s.center}>{slip.paymentMethod === "COD" ? "Cash on delivery received" : "Bank transfer received"}</Text>
              <Text style={s.center}>Nothing to pay the courier</Text>
            </>
          )}
        </View>

        <View style={s.rule} />
        <Text style={s.center}>Returns within {SITE.returnDays} days of delivery.</Text>
        <Text style={s.center}>Help: {SITE.supportPhone}</Text>
        <Text style={s.center}>{SITE.supportEmail}</Text>
        <View style={s.double} />
        <Text style={[s.center, s.bold]}>THANK YOU FOR SHOPPING WITH MIVO</Text>
      </Page>
    </Document>
  );
}
