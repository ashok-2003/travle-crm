// whoAmI answers for the console's tests: platform staff at either level.
import type { PlatformWhoAmIOutput } from "@travel-crm/contracts/platform";

export function platformStaff(
  level: PlatformWhoAmIOutput["level"] = "support",
  name = level === "support" ? "Arjun Nair" : "Kavita Rao",
): PlatformWhoAmIOutput {
  return { userId: "0199a000-0000-7000-8000-0000000000ad", name, level };
}
