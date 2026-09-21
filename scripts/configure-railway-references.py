import subprocess


def set_variables(service: str, values: dict[str, str]) -> None:
    for key, value in values.items():
        subprocess.run(
            ["railway", "variable", "set", key, "--stdin", "--service", service, "--skip-deploys"],
            input=value,
            text=True,
            check=True,
            stdout=subprocess.DEVNULL,
        )


set_variables("DEPED", {
    "NODE_ENV": "production",
    "DATABASE_URL": "${{Postgres.DATABASE_URL}}",
    "DIRECT_URL": "${{Postgres.DATABASE_URL}}",
    "CORS_ORIGIN": "https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}",
    "CLIENT_URL": "https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}",
    "DOCUMENT_STORAGE": "supabase",
})
set_variables("Frontend", {
    "VITE_API_URL": "https://${{DEPED.RAILWAY_PUBLIC_DOMAIN}}/api/v1",
})
print("Configured Railway service references.")
