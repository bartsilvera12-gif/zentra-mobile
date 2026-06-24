import { redirect } from "next/navigation";

/**
 * Home. La app está acotada al módulo de Conversaciones — siempre redirige.
 * El middleware ya hace lo mismo a nivel edge, pero conservamos el redirect
 * de RSC como red de seguridad.
 */
export default function Page() {
  redirect("/dashboard/conversaciones");
}
