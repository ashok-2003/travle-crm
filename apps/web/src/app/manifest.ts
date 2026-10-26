// The web app manifest (served at /manifest.webmanifest): what a phone needs to install the app on its home screen
// under the brand's name, with the brand's icons, opening standalone at home (DESIGN.md section 6, spec 10). Its id
// stays "/", where home was first, so phones that installed it then keep one app.
import type { MetadataRoute } from "next";
import { brand, pwaIcons } from "@travel-crm/brand";
import { routes } from "@/lib/routes";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: brand.productName,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: routes.home,
    scope: "/",
    display: "standalone",
    theme_color: brand.colours.canvas,
    background_color: brand.colours.canvas,
    icons: pwaIcons.map((icon) => ({ ...icon })),
  };
}
