import express from "express";

import { formatSearch } from "../helper";
import { scrapeSearch } from "../parser/gsm-parser";
export const search = async (req: express.Request, res: express.Response) => {
  const query = req.query.q;
  try {
    const result = await scrapeSearch(formatSearch(query as string));
    return res.status(200).json(result);
  } catch (error) {
    console.log(error);
    return res.sendStatus(400);
  }
};
