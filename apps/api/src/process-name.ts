// The long-running processes the api's image starts (docker-entrypoint.sh): each builds its services for itself.
export type ProcessName = "api" | "worker" | "console";
