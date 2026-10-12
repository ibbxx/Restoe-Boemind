"use client";

import React, { useState } from "react";

export interface WorkbookColorPickerProps {
  format?: "hex" | "rgba";
  value?: string;
  onChange?: (color: string) => void;
}

/** Warna Template Proyek (AHS & Evaluasi Vendor) */
export const TEMPLATE_COLORS = [
  { name: "Kuning Header & AHS", color: "#FFE49B" },
  { name: "Kuning Cerah", color: "#FFFF00" },
  { name: "Hijau Pendapatan & Jual", color: "#6AA84F" },
  { name: "Hijau Lembut", color: "#B6D7A8" },
  { name: "Coral Total Biaya", color: "#EA9999" },
  { name: "Salmon Rincian Biaya (HPP)", color: "#F4CCCC" },
  { name: "Merah Aksen", color: "#FF0000" },
  { name: "Abu-abu Laba Bersih & MUE", color: "#B7B7B7" },
  { name: "Abu-abu Muda", color: "#D9D9D9" },
  { name: "Putih", color: "#FFFFFF" },
  { name: "Hitam Garis", color: "#000000" },
];

/** Palet Standar Spreadsheet (Google Sheets & Excel Themes) */
export const SPREADSHEET_PALETTE = [
  // Baris 1: Skala Abu-abu / Monokrom
  ["#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#CCCCCC", "#D9D9D9", "#EFEFEF", "#F3F3F3", "#FFFFFF"],
  // Baris 2: Warna Murni Standar
  ["#980000", "#FF0000", "#FF9900", "#FFFF00", "#00FF00", "#00FFFF", "#4A86E8", "#0000FF", "#9900FF", "#FF00FF"],
  // Baris 3: Tint Sangat Muda
  ["#E6B8AF", "#F4CCCC", "#FCE5CD", "#FFF2CC", "#D9EAD3", "#D0E0E3", "#C9DAF8", "#CFE2F3", "#D9D2E9", "#EAD1DC"],
  // Baris 4: Tint Muda
  ["#DD7E6B", "#EA9999", "#F9CB9C", "#FFE599", "#B6D7A8", "#A2C4C9", "#A4C2F4", "#9FC5E8", "#B4A7D6", "#D5A6BD"],
  // Baris 5: Warna Sedang
  ["#CC4125", "#E06666", "#F6B26B", "#FFD966", "#93C47D", "#76A5AF", "#6D9EEB", "#6FA8DC", "#8E7CC3", "#C27BA0"],
  // Baris 6: Warna Primer / Tebal
  ["#A61C1C", "#CC0000", "#E69138", "#F1C232", "#6AA84F", "#45818E", "#3C78D8", "#3D85C6", "#674EA7", "#A64D79"],
  // Baris 7: Shade Gelap
  ["#5B0F00", "#660000", "#783F04", "#7F6000", "#274E13", "#0C343D", "#1155CC", "#0B5394", "#351C75", "#741B47"],
];

export function WorkbookColorPicker({ format = "hex", value, onChange }: WorkbookColorPickerProps) {
  const [customHex, setCustomHex] = useState(value || "");
  const [showCustom, setShowCustom] = useState(false);

  const handleSelect = (color: string) => {
    if (!onChange) return;
    if (format === "rgba") {
      // Convert simple hex to rgba if requested
      const hex = color.replace("#", "");
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        onChange(`rgba(${r}, ${g}, ${b}, 1)`);
        return;
      }
    }
    onChange(color);
  };

  const handleReset = () => {
    if (!onChange) return;
    onChange("");
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customHex) return;
    let formatted = customHex.trim();
    if (!formatted.startsWith("#") && /^[0-9A-Fa-f]{3,8}$/.test(formatted)) {
      formatted = `#${formatted}`;
    }
    handleSelect(formatted);
  };

  const currentColorUpper = (value || "").toUpperCase();

  return (
    <div
      data-u-comp="color-picker"
      className="workbook-color-picker-root"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "260px",
        padding: "10px",
        backgroundColor: "#FFFFFF",
        borderRadius: "8px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: "none",
      }}
    >
      {/* 1. Reset / Tanpa Warna */}
      <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={handleReset}
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "#475569",
            background: "#F1F5F9",
            border: "1px solid #CBD5E1",
            borderRadius: "4px",
            padding: "4px 8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
          title="Hapus warna / Tanpa isi"
        >
          <span style={{ display: "inline-block", width: "10px", height: "10px", border: "1px dashed #94A3B8" }} />
          Reset / Tanpa Warna
        </button>
      </div>

      {/* 2. Warna Template Proyek */}
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1E293B", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Warna Template
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "5px" }}>
          {TEMPLATE_COLORS.map((item) => {
            const isSelected = item.color.toUpperCase() === currentColorUpper;
            return (
              <button
                key={item.color}
                type="button"
                onClick={() => handleSelect(item.color)}
                title={`${item.name} (${item.color})`}
                style={{
                  width: "32px",
                  height: "24px",
                  borderRadius: "4px",
                  backgroundColor: item.color,
                  border: isSelected ? "2px solid #047857" : "1px solid rgba(0, 0, 0, 0.2)",
                  boxShadow: isSelected ? "0 0 0 2px #A7F3D0" : "none",
                  cursor: "pointer",
                  transition: "transform 100ms ease, box-shadow 100ms ease",
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* 3. Palet Warna Standar Spreadsheet */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1E293B", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Warna Standar Spreadsheet
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {SPREADSHEET_PALETTE.map((row, rIdx) => (
            <div key={rIdx} style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "3px" }}>
              {row.map((color, cIdx) => {
                const isSelected = color.toUpperCase() === currentColorUpper;
                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    type="button"
                    onClick={() => handleSelect(color)}
                    title={color}
                    style={{
                      width: "20px",
                      height: "18px",
                      borderRadius: "2px",
                      backgroundColor: color,
                      border: isSelected ? "1.5px solid #047857" : "1px solid rgba(0, 0, 0, 0.12)",
                      boxShadow: isSelected ? "0 0 0 1px #10B981" : "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Pilihan Warna Kustom / HEX */}
      <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "8px", marginTop: "8px" }}>
        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            style={{
              fontSize: "12px",
              color: "#047857",
              fontWeight: 500,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 0",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            + Warna Kustom (HEX)
          </button>
        ) : (
          <form onSubmit={handleApplyCustom} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="#FFFFFF"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              style={{
                width: "90px",
                fontSize: "12px",
                padding: "3px 6px",
                border: "1px solid #CBD5E1",
                borderRadius: "4px",
                outline: "none",
              }}
            />
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "3px",
                backgroundColor: customHex.startsWith("#") ? customHex : `#${customHex}`,
                border: "1px solid #94A3B8",
              }}
            />
            <button
              type="submit"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#FFFFFF",
                backgroundColor: "#047857",
                border: "none",
                borderRadius: "4px",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              Pilih
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
