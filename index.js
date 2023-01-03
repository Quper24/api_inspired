import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "path";
import * as url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const DB_FILE = path.resolve(__dirname, "db.json");
const PORT = process.env.PORT || 8024;
const URI_PREFIX = "/api/goods";

const db = JSON.parse(readFileSync(DB_FILE) || "[]");

const shuffle = (array) => {
  const shuffleArray = [...array];
  for (let i = shuffleArray.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [shuffleArray[i], shuffleArray[j]] = [shuffleArray[j], shuffleArray[i]];
  }

  return shuffleArray;
};

class ApiError extends Error {
  constructor(statusCode, data) {
    super();
    this.statusCode = statusCode;
    this.data = data;
  }
}

const pagination = (data, page, count) => {
  const end = count * page;
  const start = page === 1 ? 0 : end - count;
  const totalCount = data.length;

  const pages = Math.ceil(data.length / count);

  return {
    goods: data.slice(start, end),
    page,
    pages,
    totalCount,
  };
};

const getGoodsList = (params = {}) => {
  console.log("params: ", params);
  const page = +params.page || 1;
  const paginationCount = params.count || 12;

  let data = [...db.goods];

  if (params.top) {
    data = data.filter((item) => item.top && item.gender === params.top);
    data = shuffle(data);
    data.length = 8;
    return data;
  }

  if (params.gender) {
    data = data.filter((item) => item.gender === params.gender);
  }

  if (params.category) {
    if (!params.gender) throw new ApiError(403, { message: "Not gender params" });
    data = data.filter((item) => item.category === params.category);
  }

  if (params.type) {
    data = data.filter((item) => item.type === params.type);
  }

  if (params.search) {
    const search = params.search.trim().toLowerCase();
    data = db.goods.filter((item) => {
      return (
        item.title.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search)
      );
    });
  }

  if (params.list) {
    const list = params.list.trim().toLowerCase();
    return db.goods.filter((item) => list.includes(item.id));
  }

  // if (params.color) {
  //   data = data.filter((item) => params.color?.includes(item.color));
  // }

  return pagination(data, page, paginationCount);
};

const getItems = (itemId) => {
  const item = db.goods.find(({ id }) => id === itemId);
  if (!item) throw new ApiError(404, { message: "Item Not Found" });
  return item;
};

createServer(async (req, res) => {
  // req - объект с информацией о запросе, res - объект для управления отправляемым ответом
  // чтобы не отклонять uri с img
  if (req.url.substring(1, 4) === "img") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    require("fs").readFile(`.${req.url}`, (err, image) => {
      res.end(image);
    });
    return;
  }

  // этот заголовок ответа указывает, что тело ответа будет в JSON формате
  res.setHeader("Content-Type", "application/json");

  // CORS заголовки ответа для поддержки кросс-доменных запросов из браузера
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // запрос с методом OPTIONS может отправлять браузер автоматически для проверки CORS заголовков
  // в этом случае достаточно ответить с пустым телом и этими заголовками
  if (req.method === "OPTIONS") {
    // end = закончить формировать ответ и отправить его клиенту
    res.end();
    return;
  }

  if (req.url.includes("/api/categories")) {
    res.end(JSON.stringify(db.categories));
    return;
  }

  if (req.url.includes("/api/colors")) {
    res.end(JSON.stringify(db.colors));
    return;
  }

  // если URI не начинается с нужного префикса - можем сразу отдать 404
  if (!req.url || !req.url.startsWith(URI_PREFIX)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ message: "Not Found" }));
    return;
  }

  // убираем из запроса префикс URI, разбиваем его на путь и параметры
  const [uri, query] = req.url.substring(URI_PREFIX.length).split("?");
  const queryParams = {};
  // параметры могут отсутствовать вообще или иметь вид a=b&b=c
  // во втором случае наполняем объект queryParams { a: 'b', b: 'c' }
  if (query) {
    for (const piece of query.split("&")) {
      const [key, value] = piece.split("=");
      queryParams[key] = value ? decodeURIComponent(value) : "";
    }
  }

  try {
    // обрабатываем запрос и формируем тело ответа
    const body = await (() => {
      const postPrefix = uri.substring(1);

      if (req.method !== "GET") return;
      if (uri === "" || uri === "/") {
        // /api/goods
        return getGoodsList(queryParams);
      }
      // /api/goods/{id}
      // параметр {id} из URI запроса

      return getItems(postPrefix);
    })();
    res.end(JSON.stringify(body));
  } catch (err) {
    console.log("err: ", err);
    // обрабатываем сгенерированную нами же ошибку
    if (err instanceof ApiError) {
      res.writeHead(err.statusCode);
      res.end(JSON.stringify(err.data));
    } else {
      // если что-то пошло не так - пишем об этом в консоль и возвращаем 500 ошибку сервера
      res.statusCode = 500;
      res.end(JSON.stringify({ message: "Server Error" }));
    }
  }
})
  // выводим инструкцию, как только сервер запустился...
  .on("listening", () => {
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `Сервер Inspired запущен. Вы можете использовать его по адресу http://localhost:${PORT}`
      );
      console.log("Нажмите CTRL+C, чтобы остановить сервер");
      console.log("Доступные методы:");
      console.log(`GET ${URI_PREFIX} - получить список всех товаров с пагинацией`);
      console.log(`GET ${URI_PREFIX}/{id} - получить товар по его ID`);
      console.log(`GET /api/categories - получить список категорий`);
      console.log(`GET /api/colors - получить список цветов`);
      console.log(
        `GET ${URI_PREFIX}?[param]
Параметры:
        top
        gender
        category&gender
        search = поиск
        count = количество товаров (12)
        page = страница (1)
        list={id},{id} - получить список товаров по id
        `
      );
    }
  })
  // ...и вызываем запуск сервера на указанном порту
  .listen(PORT);



