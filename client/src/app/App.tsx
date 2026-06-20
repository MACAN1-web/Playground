import { useEffect, useState } from "react";
import { api } from "../shared/api/client";
import type { Direction } from "../shared/types/rating";
import { keepScrollPosition } from "../shared/lib/format";
import { Header } from "../widgets/Header/Header";
import { SearchPage } from "../pages/SearchPage/SearchPage";
import { DirectionsPage } from "../pages/DirectionsPage/DirectionsPage";

export default function App() {
  const [tab, setTab] = useState<"search" | "lists">("search");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [loadError, setLoadError] = useState("");
  const refresh = () =>
    api.get<Direction[]>("/api/directions")
      .then((data) => {
        setDirections(data);
        setLoadError("");
      })
      .catch(() => setLoadError("Не удалось подключиться к серверу. Проверьте, что backend запущен."));

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const events = api.eventSource("/api/events");
    events.addEventListener("ratings-changed", () => { void keepScrollPosition(refresh); });
    return () => events.close();
  }, []);

  return <>
    <Header activeTab={tab} onTabChange={setTab} />
    <main>{loadError && <p className="error-banner">{loadError}</p>}{tab === "search" ? <SearchPage /> : <DirectionsPage directions={directions} />}</main>
  </>;
}
