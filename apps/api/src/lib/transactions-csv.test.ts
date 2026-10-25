import { describe, expect, test } from "bun:test";
import { IMMEDIATE_INCOME } from "@znab/shared";
import { csvField, csvLine, formatMoney, transactionsCsv, type CsvTransactionRow } from "./transactions-csv";

const row: CsvTransactionRow = {
  account: "Checking",
  date: "2025-03-01",
  payee: "Corner Grocer",
  categoryGroup: "Everyday",
  category: "Groceries",
  categoryYnabId: null,
  memo: null,
  amount: "-1234.50",
  cleared: "Cleared",
  flag: null,
  splitIndex: 0,
  splitCount: 0,
};

describe("csvField", () => {
  test("leaves plain text alone and quotes what would break a line", () => {
    expect(csvField("Rent")).toBe("Rent");
    expect(csvField(null)).toBe("");
    expect(csvField("Smith, J")).toBe('"Smith, J"');
    expect(csvField('a "quoted" word')).toBe('"a ""quoted"" word"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
  });

  test("defuses anything a spreadsheet would run as a formula", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-refund")).toBe("'-refund");
    expect(csvField("@sum")).toBe("'@sum");
    expect(csvField("=1,2")).toBe(`"'=1,2"`);
  });
});

test("formatMoney writes whole cents the way the app shows money", () => {
  expect(formatMoney(123450)).toBe("$1,234.50");
  expect(formatMoney(5)).toBe("$0.05");
  expect(formatMoney(0)).toBe("$0.00");
});

describe("csvLine", () => {
  test("an outflow goes in the outflow column, positive, with the cleared letter", () => {
    expect(csvLine(row)).toBe(
      'Checking,2025-03-01,Corner Grocer,Everyday,Groceries,,"$1,234.50",$0.00,C,'
    );
  });

  test("income is filed under the label the register gives it", () => {
    expect(
      csvLine({
        ...row,
        amount: "2000",
        categoryGroup: null,
        category: null,
        categoryYnabId: IMMEDIATE_INCOME,
        cleared: "Reconciled",
        flag: "Red",
      })
    ).toBe('Checking,2025-03-01,Corner Grocer,Income,Income for this month,,$0.00,"$2,000.00",R,Red');
  });

  test("a split line says which part of the split it is", () => {
    expect(csvLine({ ...row, amount: "-10", memo: "milk", splitIndex: 1, splitCount: 2 })).toContain(
      ",(Split 1/2) milk,$10.00,"
    );
    expect(csvLine({ ...row, amount: "-10", splitIndex: 2, splitCount: 2 })).toContain(",(Split 2/2),");
  });
});

test("transactionsCsv writes a header and CRLF-terminated lines", () => {
  const csv = transactionsCsv([row]);
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe("Account,Date,Payee,Category Group,Category,Memo,Outflow,Inflow,Cleared,Flag");
  expect(lines).toHaveLength(3);
  expect(lines[2]).toBe("");
});
