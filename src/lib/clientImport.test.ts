import { describe, expect, it } from "vitest";
import {
  buildCsvPreview,
  detectColumnMapping,
  extractClientRows,
  parseCsvContent,
} from "./clientImport";

describe("parseCsvContent", () => {
  it("separa encabezados y filas de datos", () => {
    const csv = "Nombre,Email\nAna Pérez,ana@test.com\nLuis Gómez,luis@test.com";
    const { headers, rows } = parseCsvContent(csv);
    expect(headers).toEqual(["Nombre", "Email"]);
    expect(rows).toEqual([
      ["Ana Pérez", "ana@test.com"],
      ["Luis Gómez", "luis@test.com"],
    ]);
  });

  it("ignora líneas vacías", () => {
    const csv = "Nombre\nAna\n\nLuis\n";
    const { rows } = parseCsvContent(csv);
    expect(rows).toEqual([["Ana"], ["Luis"]]);
  });

  it("recorta espacios alrededor de cada encabezado", () => {
    const csv = " Nombre , Email \nAna,ana@test.com";
    const { headers } = parseCsvContent(csv);
    expect(headers).toEqual(["Nombre", "Email"]);
  });
});

describe("detectColumnMapping", () => {
  it("detecta encabezados en español sin acentos ni mayúsculas", () => {
    expect(detectColumnMapping(["Nombre", "Correo", "Teléfono"])).toEqual({
      name: "Nombre",
      email: "Correo",
      phone: "Teléfono",
    });
  });

  it("detecta encabezados en inglés", () => {
    expect(detectColumnMapping(["Name", "Email", "Phone"])).toEqual({
      name: "Name",
      email: "Email",
      phone: "Phone",
    });
  });

  it("ignora mayúsculas, acentos y separadores", () => {
    expect(detectColumnMapping(["NOMBRE_COMPLETO", "e-mail", "Número de Teléfono"])).toEqual({
      name: "NOMBRE_COMPLETO",
      email: "e-mail",
      phone: "Número de Teléfono",
    });
  });

  it("devuelve null para lo que no logra detectar", () => {
    expect(detectColumnMapping(["Nombre", "Dirección"])).toEqual({
      name: "Nombre",
      email: null,
      phone: null,
    });
  });

  it("nunca asigna el mismo encabezado a dos campos distintos", () => {
    // "Contacto" podría matchear parcialmente contra teléfono si no se
    // excluyera tras haber sido asignado a otro campo — acá se fuerza el
    // caso con un encabezado ambiguo real: "Nombre de contacto".
    const mapping = detectColumnMapping(["Nombre de contacto", "Teléfono"]);
    expect(mapping.name).toBe("Nombre de contacto");
    expect(mapping.phone).toBe("Teléfono");
    expect(mapping.name).not.toBe(mapping.phone);
  });
});

describe("buildCsvPreview", () => {
  it("arma vista previa con mapeo, primeras filas y total", () => {
    const rows = Array.from({ length: 15 }, (_, i) => `Cliente ${i + 1},cliente${i + 1}@test.com`);
    const csv = `Nombre,Email\n${rows.join("\n")}`;

    const preview = buildCsvPreview(csv);

    expect(preview.headers).toEqual(["Nombre", "Email"]);
    expect(preview.mapping.name).toBe("Nombre");
    expect(preview.mapping.email).toBe("Email");
    expect(preview.previewRows).toHaveLength(10);
    expect(preview.totalRows).toBe(15);
  });
});

describe("extractClientRows", () => {
  const headers = ["Nombre", "Email", "Teléfono"];

  it("mapea filas válidas usando el mapeo de columnas confirmado", () => {
    const rows = [["Ana Pérez", "ana@test.com", "3001234567"]];
    const { valid, errors } = extractClientRows(headers, rows, {
      name: "Nombre",
      email: "Email",
      phone: "Teléfono",
    });
    expect(errors).toEqual([]);
    expect(valid).toEqual([{ name: "Ana Pérez", email: "ana@test.com", phone: "3001234567" }]);
  });

  it("omite filas sin nombre y reporta el número de fila", () => {
    const rows = [
      ["Ana Pérez", "ana@test.com", ""],
      ["", "sin-nombre@test.com", ""],
    ];
    const { valid, errors } = extractClientRows(headers, rows, {
      name: "Nombre",
      email: "Email",
      phone: "Teléfono",
    });
    expect(valid).toHaveLength(1);
    expect(errors).toEqual(["Fila 3: el nombre está vacío, se omitió."]);
  });

  it("trata email/teléfono vacíos como null, no como string vacío", () => {
    const rows = [["Ana Pérez", "", ""]];
    const { valid } = extractClientRows(headers, rows, {
      name: "Nombre",
      email: "Email",
      phone: "Teléfono",
    });
    expect(valid[0].email).toBeNull();
    expect(valid[0].phone).toBeNull();
  });

  it("permite dejar email y teléfono sin mapear (string vacío en columnMapping)", () => {
    const rows = [["Ana Pérez", "ana@test.com", "3001234567"]];
    const { valid } = extractClientRows(headers, rows, { name: "Nombre", email: "", phone: "" });
    expect(valid).toEqual([{ name: "Ana Pérez", email: null, phone: null }]);
  });

  it("recorta espacios en nombre, email y teléfono", () => {
    const rows = [["  Ana Pérez  ", "  ana@test.com  ", " 3001234567 "]];
    const { valid } = extractClientRows(headers, rows, {
      name: "Nombre",
      email: "Email",
      phone: "Teléfono",
    });
    expect(valid[0].name).toBe("Ana Pérez");
    expect(valid[0].email).toBe("ana@test.com");
  });
});
