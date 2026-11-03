/**
 * Recolors the OpenFreeMap Liberty style into the site's cream and ink palette.
 * Sources, glyphs, and attribution stay on OpenFreeMap. No other tile provider.
 */

const GROUND = "#e6d9c8";
const PARK = "#ddd4c3";
const WATER = "#a9b4b2";
const ROAD = "#f7f1e8";
const CASING = "#d5c7b4";
const INK = "#4e433a";
const HALO = "#f6efe6";

function paintOf(layer) {
  return { ...(layer.paint || {}) };
}

export function quietLiberty(style) {
  const next = {
    ...style,
    layers: (style.layers || []).map((layer) => {
      const id = layer.id || "";
      const paint = paintOf(layer);
      const layout = { ...(layer.layout || {}) };

      if (
        id.startsWith("poi_") ||
        id.startsWith("road_one_way") ||
        id.includes("shield") ||
        id === "landcover_wetland" ||
        id === "road_area_pattern"
      ) {
        layout.visibility = "none";
      }

      if (id === "background") paint["background-color"] = GROUND;
      if (id === "natural_earth") paint["raster-opacity"] = 0.1;

      if (id === "water" || id.startsWith("waterway")) {
        if ("fill-color" in paint) paint["fill-color"] = WATER;
        if ("line-color" in paint) paint["line-color"] = WATER;
      }

      if (
        id.startsWith("park") ||
        id.startsWith("landcover") ||
        id.startsWith("landuse") ||
        id === "aeroway_fill"
      ) {
        if ("fill-color" in paint) paint["fill-color"] = id.includes("wood") ? "#d4cbb8" : PARK;
        if ("fill-outline-color" in paint) paint["fill-outline-color"] = "#d2c6b4";
        if ("line-color" in paint) paint["line-color"] = "#cfc3b2";
        if ("fill-opacity" in paint && id.startsWith("landcover")) paint["fill-opacity"] = 0.9;
      }

      if (id.startsWith("road_")) {
        if (id.includes("casing") && "line-color" in paint) paint["line-color"] = CASING;
        else if (id.includes("motorway") && "line-color" in paint) paint["line-color"] = "#e4d2b6";
        else if (id.includes("rail") && "line-color" in paint) paint["line-color"] = "#b7aa9c";
        else if (
          (id.includes("path") || id.includes("pedestrian") || id.includes("track")) &&
          "line-color" in paint
        ) {
          paint["line-color"] = "#cbbdaa";
        } else if ("line-color" in paint) paint["line-color"] = ROAD;
      }

      if (id === "building") {
        paint["fill-color"] = "#f3ece1";
        paint["fill-outline-color"] = "#cbbba6";
      }

      if (id === "building-3d") {
        paint["fill-extrusion-color"] = "#e7dccb";
        paint["fill-extrusion-opacity"] = 0.94;
        paint["fill-extrusion-vertical-gradient"] = true;
      }

      if (layer.type === "symbol") {
        if ("text-color" in paint) paint["text-color"] = INK;
        if ("text-halo-color" in paint) paint["text-halo-color"] = HALO;
        if ("text-halo-width" in paint && typeof paint["text-halo-width"] === "number") {
          paint["text-halo-width"] = 1.15;
        }
      }

      const quiet = { ...layer, paint };
      if (Object.keys(layout).length) quiet.layout = layout;
      return quiet;
    }),
    light: {
      anchor: "map",
      position: [1.15, 150, 40],
      color: "#f4efe6",
      intensity: 0.35
    },
    sky: {
      "sky-color": "#f3eadf",
      "horizon-color": "#e7d3b4",
      "fog-color": "#efe4d2",
      "sky-horizon-blend": 0.55,
      "horizon-fog-blend": 0.65,
      "atmosphere-blend": 0.28
    }
  };

  return next;
}

/** Colors for the study plate. Diagram is figure-ground; dark is the night plate. */
export function studyColors(theme, mode) {
  const dark = theme === "dark";
  const diagram = mode === "diagram";
  return {
    ground: dark ? "#1a1612" : diagram ? "#f4efe6" : "#e7dccb",
    mask: dark ? "#100e0c" : "#f6f1e7",
    building: dark ? (diagram ? "#f3eadf" : "#3d342c") : diagram ? "#2c241c" : "#e4d8c8",
    water: dark ? "#243836" : "#9aada8",
    green: dark ? "#243028" : diagram ? "#d5dece" : "#7f9468",
    wood: dark ? "#1c2820" : diagram ? "#c9d4c2" : "#6d8258",
    tree: dark ? "#3d5c40" : diagram ? "#3f5238" : "#5f7348",
    paved: dark ? "#2a2622" : "#d5cbb8",
    motorway: dark ? "#d7b48a" : diagram ? "#cbbba6" : "#8a4f28",
    primary: dark ? "#c4b5a2" : diagram ? "#d9cfc2" : "#4e433a",
    secondary: dark ? "#8a7b6c" : diagram ? "#e4d9cc" : "#8d7d6e",
    minor: dark ? "#3a322c" : diagram ? "#efe6da" : "#f3ece3",
    casing: dark ? "#241f1a" : "#d5c7b4",
    path: dark ? "#6a5e52" : "#c4b5a2",
    text: dark ? "#f3eadf" : "#4e433a",
    halo: dark ? "#1a1612" : "#f6efe6",
    sky: dark ? "#14110e" : "#f3eadf",
    horizon: dark ? "#2a241e" : "#e7d3b4",
    radius: dark ? "#f3eadf" : "#2c241c",
    contour: dark ? "#a89880" : "#6f6256"
  };
}
