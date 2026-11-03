import { sendLead } from "./lead.js";

const PDF_SRC = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";

function loadPdfLib() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-site-study-pdf="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jspdf.jsPDF), { once: true });
      existing.addEventListener("error", () => reject(new Error("pdf")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PDF_SRC;
    script.async = true;
    script.dataset.siteStudyPdf = "1";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = () => reject(new Error("The report library could not load."));
    document.head.appendChild(script);
  });
}

function line(doc, text, x, y, size, width) {
  doc.setFont("times", "normal");
  doc.setFontSize(size);
  const rows = doc.splitTextToSize(String(text || ""), width);
  doc.text(rows, x, y);
  return y + rows.length * size * 0.42 + 1.5;
}

export function figureGroundUrl(buildings, circle, turf) {
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, 520, 520);
  const box = turf.bbox(circle);
  const spanX = box[2] - box[0] || 1;
  const spanY = box[3] - box[1] || 1;
  const project = (lng, lat) => [
    26 + ((lng - box[0]) / spanX) * 468,
    494 - ((lat - box[1]) / spanY) * 468
  ];
  ctx.save();
  ctx.beginPath();
  ctx.arc(260, 260, 230, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f7f3ec";
  ctx.fillRect(0, 0, 520, 520);
  ctx.fillStyle = "#2c241c";
  (buildings || []).forEach((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    polygons.forEach((polygon) => {
      const ring = polygon[0];
      if (!ring || !ring.length) return;
      ctx.beginPath();
      ring.forEach((coord, index) => {
        const point = project(coord[0], coord[1]);
        if (index === 0) ctx.moveTo(point[0], point[1]);
        else ctx.lineTo(point[0], point[1]);
      });
      ctx.closePath();
      ctx.fill();
    });
  });
  ctx.restore();
  ctx.strokeStyle = "#2c241c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(260, 260, 230, 0, Math.PI * 2);
  ctx.stroke();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function publishReport(snap) {
  const sent = await sendLead({
    name: snap.name,
    email: snap.email,
    message: snap.message,
    site: snap.place,
    coordinates: snap.coordinates,
    radius: snap.radius,
    lotArea: snap.lotArea,
    ratios: snap.ratioText,
    sun: snap.sunText,
    wind: snap.windText,
    slope: snap.slopeText
  });
  const JsPDF = await loadPdfLib();
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const width = 178;
  let y = 18;
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.text("Josh", 16, y);
  y += 8;
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.text("Site study", 16, y);
  y += 7;
  y = line(doc, "preliminary site insight - not a survey or zoning ruling.", 16, y, 10, width);
  y += 2;
  y = line(doc, snap.place || "Unnamed site", 16, y, 12, width);
  y = line(doc, snap.coordinates + "  ·  radius " + snap.radius + " m", 16, y, 10, width);
  if (snap.lotArea) y = line(doc, "Lot area " + snap.lotArea, 16, y, 11, width);
  y += 2;
  if (snap.mapImage) {
    try {
      doc.addImage(snap.mapImage, "JPEG", 16, y, width, 96);
      y += 100;
    } catch (err) {
      y = line(doc, "Map image unavailable.", 16, y, 10, width);
    }
  }
  doc.addPage();
  y = 18;
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text("Figure-ground", 16, y);
  y += 4;
  if (snap.groundImage) {
    try {
      doc.addImage(snap.groundImage, "JPEG", 16, y, 88, 88);
    } catch (err) {
      /* The plate is optional if the canvas export fails. */
    }
  }
  y = line(doc, "Ratios inside the circle", 112, 22, 12, 80);
  y = line(doc, snap.ratioText || "Ratios were not available.", 112, y, 10, 80);
  y = Math.max(y, 112);
  y += 6;
  y = line(doc, "Sun", 16, y, 12, width);
  y = line(doc, snap.sunText || "Sun reading unavailable.", 16, y, 10, width);
  y += 2;
  y = line(doc, "Wind", 16, y, 12, width);
  y = line(doc, snap.windText || "Wind reading unavailable.", 16, y, 10, width);
  y += 2;
  y = line(doc, "Slope", 16, y, 12, width);
  y = line(doc, snap.slopeText || "Elevation samples unavailable.", 16, y, 10, width);
  y += 4;
  y = line(doc, "Sources: OpenStreetMap contributors, OpenFreeMap, OpenMapTiles, Photon, Nominatim, Open-Meteo.", 16, y, 9, width);
  y = line(doc, "Buildings and trees are from OpenStreetMap. Overture building tiles were not used.", 16, y, 9, width);
  y += 3;
  y = line(doc, "Josh  ·  joshdesigns.fit", 16, y, 11, width);
  y = line(doc, "preliminary site insight - not a survey or zoning ruling.", 16, y, 10, width);
  doc.save("josh-site-study.pdf");
  return sent;
}
