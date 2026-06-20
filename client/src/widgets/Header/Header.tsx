type HeaderProps = {
  activeTab: "search" | "lists";
  onTabChange: (tab: "search" | "lists") => void;
};

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return <header>
    <div className="brand">
      <div className="logo">К</div>
      <div><strong>Приёмная комиссия</strong><span>Рейтинги абитуриентов</span></div>
    </div>
    <nav>
      <button className={activeTab === "search" ? "active" : ""} onClick={() => onTabChange("search")}>Найти себя</button>
      <button className={activeTab === "lists" ? "active" : ""} onClick={() => onTabChange("lists")}>Списки поступающих</button>
    </nav>
  </header>;
}
