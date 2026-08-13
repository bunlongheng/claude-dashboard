"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/db";

export async function signIn(formData: FormData) {
    const email    = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await auth.signIn(email, password);
    if (result.error) return { error: result.error };

    redirect("/dashboard");
}

export async function signOut() {
    await auth.signOut();
    redirect("/?logged_out=1");
}
