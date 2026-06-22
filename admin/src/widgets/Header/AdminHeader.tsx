import logo from "../../assets/logo.jpg";

export function AdminHeader() {
  return <header>
    <div className="brand">
      <img className="logo" src={logo} alt="Логотип колледжа" />
      <div><strong>Панель управления</strong><span>Для работников колледжа</span></div>
    </div>
  </header>;
}
