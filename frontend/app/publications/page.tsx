import { redirect } from "next/navigation"

/** The repository moved to /regulatory; keep old `/publications?state=…` links working. */
export default async function Page({ searchParams }: PageProps<"/publications">) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value)
  }
  const query = params.toString()
  redirect(`/regulatory${query ? `?${query}` : ""}`)
}
