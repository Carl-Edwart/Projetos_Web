import type { Kysely, Transaction } from "kysely";
import type { Database, ProductVariantRow } from "../database/types.js";

export type DbExecutor = Kysely<Database> | Transaction<Database>;

export interface VariantForSale extends ProductVariantRow {
  product_code: string;
  product_name: string;
  product_kind: string;
  product_is_active: boolean;
}

export class CatalogRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listCatalog() {
    const products = await this.db
      .selectFrom("products")
      .select(["id", "code", "name", "kind", "description"])
      .where("is_active", "=", true)
      .orderBy("name")
      .execute();

    if (products.length === 0) return [];

    const variants = await this.db
      .selectFrom("product_variants")
      .innerJoin("products", "products.id", "product_variants.product_id")
      .select([
        "product_variants.id",
        "product_variants.product_id",
        "product_variants.variant_code",
        "product_variants.display_name",
        "product_variants.attributes",
        "product_variants.price_cents",
        "product_variants.currency",
        "product_variants.available_quantity",
      ])
      .where("products.is_active", "=", true)
      .where("product_variants.is_active", "=", true)
      .where("product_variants.is_available", "=", true)
      .where((eb) => eb.or([
        eb("product_variants.available_quantity", "is", null),
        eb("product_variants.available_quantity", ">", 0),
      ]))
      .orderBy("product_variants.display_name")
      .execute();

    return products.map((product) => ({
      ...product,
      variants: variants
        .filter((variant) => variant.product_id === product.id)
        .map((variant) => ({
          id: variant.id,
          code: variant.variant_code,
          name: variant.display_name,
          attributes: variant.attributes,
          priceCents: String(variant.price_cents),
          currency: variant.currency,
          availableQuantity: variant.available_quantity,
        })),
    })).filter((product) => product.variants.length > 0);
  }

  async getVariants(ids: string[], executor: DbExecutor = this.db, lock = false): Promise<VariantForSale[]> {
    if (ids.length === 0) return [];
    let query = executor
      .selectFrom("product_variants")
      .innerJoin("products", "products.id", "product_variants.product_id")
      .select([
        "product_variants.id",
        "product_variants.product_id",
        "product_variants.variant_code",
        "product_variants.display_name",
        "product_variants.attributes",
        "product_variants.price_cents",
        "product_variants.currency",
        "product_variants.available_quantity",
        "product_variants.is_available",
        "product_variants.is_active",
        "product_variants.created_at",
        "product_variants.updated_at",
        "products.code as product_code",
        "products.name as product_name",
        "products.kind as product_kind",
        "products.is_active as product_is_active",
      ])
      .where("product_variants.id", "in", ids);
    if (lock) query = query.forUpdate() as typeof query;
    return query.execute() as Promise<VariantForSale[]>;
  }

  async activeRestrictedNumbers(executor: DbExecutor = this.db): Promise<number[]> {
    const rows = await executor
      .selectFrom("restricted_numbers")
      .select("number")
      .where("is_active", "=", true)
      .execute();
    return rows.map((row) => row.number);
  }

  async activeNamePatterns(executor: DbExecutor = this.db) {
    return executor
      .selectFrom("restricted_name_patterns")
      .select(["category", "normalized_pattern"])
      .where("is_active", "=", true)
      .execute();
  }

  async buyerOptions(executor: DbExecutor = this.db) {
    const rows = await executor
      .selectFrom("checkout_options")
      .select(["option_type", "value", "label"])
      .where("is_active", "=", true)
      .orderBy("label")
      .execute();
    return {
      classes: rows.filter((row) => row.option_type === "class").map(({ value, label }) => ({ value, label })),
      modalities: rows.filter((row) => row.option_type === "modality").map(({ value, label }) => ({ value, label })),
    };
  }
}
