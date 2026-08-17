import { ImageResponse } from "next/og";

// L'icona per la schermata home di iOS. Serve in PNG — Safari l'SVG qui non lo
// prende — e si genera dal codice invece che da un file binario: cosi' resta
// una cosa sola da cambiare se il marchio cambia, e non c'e' un'immagine nel
// repository che silenziosamente diverge dall'altra.
//
// iOS arrotonda gli angoli per conto suo e non ama la trasparenza: il fondo e'
// pieno fino al bordo.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0d0c",
        }}
      >
        {/* L'anello. Le stesse proporzioni dell'icona vettoriale, in scala:
            anello 18/32 del lato, spessore 3.2/32, nucleo 4.4/32. */}
        <div
          style={{
            width: 101,
            height: 101,
            border: "18px solid #dfb45f",
            borderRadius: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 25,
              height: 25,
              borderRadius: 7,
              background: "#dfb45f",
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
