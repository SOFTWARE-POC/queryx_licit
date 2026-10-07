import { useEffect, useState } from "react";

export type Route =
  | { name: "overview" }
  | { name: "library" }
  | { name: "report"; id: string }
  | { name: "builder"; id: string | null };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "relatorios" && parts[1]) return { name: "report", id: parts[1] };
  if (parts[0] === "relatorios") return { name: "library" };
  if (parts[0] === "construtor") return { name: "builder", id: parts[1] ?? null };
  return { name: "overview" };
}

export function href(route: Route): string {
  switch (route.name) {
    case "overview":
      return "#/";
    case "library":
      return "#/relatorios";
    case "report":
      return `#/relatorios/${encodeURIComponent(route.id)}`;
    case "builder":
      return route.id ? `#/construtor/${encodeURIComponent(route.id)}` : "#/construtor";
  }
}

export const go = (route: Route) => {
  window.location.hash = href(route);
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
