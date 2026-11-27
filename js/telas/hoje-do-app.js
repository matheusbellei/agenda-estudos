// "Hoje" no fuso do app (o dia vale a partir da hora local escolhida nos ajustes).
import { agoraNoFuso } from '../regras/lembretes.js';

export function hojeDoApp(estado) {
  return agoraNoFuso(Date.now(), estado.ajustes().fuso).data;
}
