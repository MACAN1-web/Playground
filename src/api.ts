const jsonHeaders = { "Content-Type": "application/json" };

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return null as T;
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const data = contentType.includes("application/json") && text ? JSON.parse(text) : null;
  if (!contentType.includes("application/json")) {
    throw new Error(response.ok ? "Сервер вернул не JSON. Перезапустите backend и попробуйте снова." : "Запрос не обработан backend-сервером.");
  }
  if (!response.ok) throw new Error(data?.error || "Произошла ошибка");
  return data as T;
}

export const api = {
  get: <T>(url: string, token?: string) =>
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(parse<T>),
  post: <T>(url: string, body: unknown, token?: string) =>
    fetch(url, {
      method: "POST",
      headers: { ...jsonHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    }).then(parse<T>),
  patch: <T>(url: string, body: unknown, token: string) =>
    fetch(url, {
      method: "PATCH",
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    }).then(parse<T>),
  upload: <T>(url: string, body: FormData, token: string) =>
    fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body }).then(parse<T>),
  download: async (url: string, token: string) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : null;
      throw new Error(data?.error || "Не удалось скачать файл");
    }
    const disposition = response.headers.get("content-disposition") || "";
    const filename = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] || "export.xlsx");
    return { blob: await response.blob(), filename };
  },
  delete: <T>(url: string, body: unknown, token: string) =>
    fetch(url, {
      method: "DELETE",
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    }).then(parse<T>)
};
