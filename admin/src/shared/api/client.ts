const jsonHeaders = { "Content-Type": "application/json" };
const apiBaseUrl = import.meta.env.VITE_API_URL || "";

const url = (path: string) => `${apiBaseUrl}${path}`;

const loggedFetch = async (path: string, init: RequestInit = {}) => {
  const requestUrl = url(path);
  const method = init.method || "GET";
  console.info("[admin-api] request", { method, url: requestUrl || path });
  try {
    const response = await fetch(requestUrl, init);
    console.info("[admin-api] response", {
      method,
      url: requestUrl || path,
      status: response.status,
      contentType: response.headers.get("content-type")
    });
    return response;
  } catch (error) {
    console.error("[admin-api] network error", { method, url: requestUrl || path, error });
    throw error;
  }
};

type TokenGetter = () => string;
type TokenSetter = (token: string) => void;

let getToken: TokenGetter = () => "";
let setToken: TokenSetter = () => {};

export const configureAuthToken = (getter: TokenGetter, setter: TokenSetter) => {
  getToken = getter;
  setToken = setter;
};

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

const refreshAccessToken = async () => {
  const data = await loggedFetch("/api/auth/refresh", { method: "POST", credentials: "include" }).then(parse<{ accessToken: string }>);
  setToken(data.accessToken);
  return data.accessToken;
};

const withRefresh = async <T>(request: (token: string) => Promise<Response>) => {
  let response = await request(getToken());
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    response = await request(newToken);
  }
  return parse<T>(response);
};

export const api = {
  get: <T>(path: string) =>
    withRefresh<T>((token) => loggedFetch(path, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" })),
  post: <T>(path: string, body: unknown, token?: string) =>
    loggedFetch(path, {
      method: "POST",
      headers: { ...jsonHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      credentials: "include"
    }).then(parse<T>),
  patch: <T>(path: string, body: unknown) =>
    withRefresh<T>((token) => loggedFetch(path, {
      method: "PATCH",
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: "include"
    })),
  upload: <T>(path: string, body: FormData) =>
    withRefresh<T>((token) => loggedFetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body, credentials: "include" })),
  download: async (path: string) => {
    let response = await loggedFetch(path, { headers: { Authorization: `Bearer ${getToken()}` }, credentials: "include" });
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      response = await loggedFetch(path, { headers: { Authorization: `Bearer ${newToken}` }, credentials: "include" });
    }
    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : null;
      throw new Error(data?.error || "Не удалось скачать файл");
    }
    const disposition = response.headers.get("content-disposition") || "";
    const filename = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] || "export.xlsx");
    return { blob: await response.blob(), filename };
  },
  delete: <T>(path: string, body: unknown) =>
    withRefresh<T>((token) => loggedFetch(path, {
      method: "DELETE",
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: "include"
    })),
  eventSource: (path: string) => {
    console.info("[admin-api] event-source", { url: url(path) || path });
    return new EventSource(url(path), { withCredentials: true });
  }
};
