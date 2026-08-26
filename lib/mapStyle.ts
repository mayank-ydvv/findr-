/**
 * Custom dark style for the campus map. Deliberately desaturated toward a
 * moss/charcoal palette (not the generic navy-tinted "dark mode" default) so
 * the amber (lost) and emerald (found) pins are the only saturated color on
 * screen. Passed as inline `styles` on <Map>, which requires NOT setting a
 * `mapId` — Advanced Markers need a Cloud-console-managed style instead, and
 * that extra manual setup step isn't worth it for what inline JSON already
 * gives us for free.
 */
export const CAMPUS_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#161c18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7c8a80" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#161c18" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#2a332c" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#1c2320" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#262f28" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1c2320" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#333f35" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f1613" }],
  },
];
