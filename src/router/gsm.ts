import express from "express";

import { search } from "../controllers/gsm";

export default (router: express.Router) => {
  router.get("/gsm/search", search);
};
