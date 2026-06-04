/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user?: { email?: string | null; name?: string | null };
    tenantId?: string;
  }
}
