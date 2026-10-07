import { types } from "pg";

// `date` sem fuso: devolve o texto (AAAA-MM-DD) em vez de um Date na meia-noite
// do fuso do servidor, que viraria o dia anterior em UTC.
types.setTypeParser(1082, (v: string) => v);
