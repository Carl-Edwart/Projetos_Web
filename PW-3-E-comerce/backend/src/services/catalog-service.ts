import type { Kysely, Transaction } from "kysely";
import type { AppConfig } from "../config/env.js";
import type { Database } from "../database/types.js";
import { AppError, badRequest, conflict } from "../domain/errors.js";
import { canonicalNumber, normalizeHumanText } from "../domain/normalization.js";
import { findRestrictedNamePattern, isRestrictedNumber } from "../domain/moderation.js";
import { CatalogRepository, type DbExecutor, type VariantForSale } from "../repositories/catalog-repository.js";

export interface CartLineInput {
  variantId: string;
  quantity: number;
  customization?: {
    shirtName?: string;
    jerseyNumber?: string;
  };
}

export interface PreparedCartLine {
  variant: VariantForSale;
  quantity: number;
  customization: Record<string, string>;
  unitPriceCents: bigint;
  lineTotalCents: bigint;
}

export interface PreparedCart {
  lines: PreparedCartLine[];
  subtotalCents: bigint;
  totalCents: bigint;
}

export class CatalogService {
  private readonly repository: CatalogRepository;

  constructor(private readonly db: Kysely<Database>, private readonly config: AppConfig) {
    this.repository = new CatalogRepository(db);
  }

  list() {
    return this.repository.listCatalog();
  }

  options() {
    return this.repository.buyerOptions();
  }

  async prepareCart(items: CartLineInput[], executor: DbExecutor = this.db, lock = false): Promise<PreparedCart> {
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      throw badRequest("INVALID_CART", "Adicione pelo menos um item à compra.");
    }

    const variantIds = [...new Set(items.map((item) => item.variantId))];
    const variants = await this.repository.getVariants(variantIds, executor, lock);
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const restrictedNumbers = await this.repository.activeRestrictedNumbers(executor);
    const patterns = await this.repository.activeNamePatterns(executor);
    const stockRequests = new Map<string, number>();
    const lines: PreparedCartLine[] = [];

    for (const item of items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > this.config.maxItemQuantity) {
        throw badRequest("INVALID_QUANTITY", "Confira a quantidade dos itens.");
      }
      const variant = byId.get(item.variantId);
      if (!variant || !variant.product_is_active || !variant.is_active || !variant.is_available) {
        throw conflict("ITEM_UNAVAILABLE", "Um dos itens selecionados não está mais disponível.");
      }

      stockRequests.set(variant.id, (stockRequests.get(variant.id) ?? 0) + item.quantity);
      const customization = this.validateCustomization(variant, item.customization, restrictedNumbers, patterns);
      const unitPriceCents = BigInt(variant.price_cents);
      lines.push({
        variant,
        quantity: item.quantity,
        customization,
        unitPriceCents,
        lineTotalCents: unitPriceCents * BigInt(item.quantity),
      });
    }

    for (const [variantId, quantity] of stockRequests) {
      const variant = byId.get(variantId)!;
      if (variant.available_quantity !== null && variant.available_quantity < quantity) {
        throw conflict("INSUFFICIENT_STOCK", "A quantidade disponível de um item foi alterada. Confira sua compra.");
      }
    }

    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0n);
    if (subtotalCents <= 0n) throw badRequest("INVALID_ORDER_TOTAL", "O total da compra não é válido.");
    return { lines, subtotalCents, totalCents: subtotalCents };
  }

  async assertBuyerOptions(
    className: string,
    modality: string,
    executor: DbExecutor,
  ): Promise<void> {
    const options = await this.repository.buyerOptions(executor);
    if (options.classes.length > 0 && !options.classes.some((option) => option.value === className)) {
      throw badRequest("INVALID_BUYER_DATA", "Confira os campos destacados.", { className: "Selecione uma turma válida." });
    }
    if (options.modalities.length > 0 && !options.modalities.some((option) => option.value === modality)) {
      throw badRequest("INVALID_BUYER_DATA", "Confira os campos destacados.", { modality: "Selecione uma modalidade válida." });
    }
  }

  private validateCustomization(
    variant: VariantForSale,
    input: CartLineInput["customization"],
    restrictedNumbers: number[],
    patterns: Array<{ category: string; normalized_pattern: string }>,
  ): Record<string, string> {
    if (variant.product_kind === "CAMISETA") {
      const shirtName = normalizeHumanText(input?.shirtName ?? "");
      const jerseyNumber = (input?.jerseyNumber ?? "").trim();
      if (shirtName.length < 1 || shirtName.length > 40 || !/^[\p{L}\p{M} .'-]+$/u.test(shirtName)) {
        throw badRequest("INVALID_SHIRT_NAME", "Informe um nome válido para a camiseta.", { shirtName: "Informe um nome válido." });
      }
      if (!canonicalNumber(jerseyNumber)) {
        throw badRequest("INVALID_SHIRT_NUMBER", "Informe um número válido para a camiseta.", { jerseyNumber: "Informe um número válido." });
      }
      if (isRestrictedNumber(jerseyNumber, restrictedNumbers)) {
        throw new AppError(422, "RESTRICTED_NUMBER", "Este número não está disponível. Escolha outro.", {
          jerseyNumber: "Este número não está disponível. Escolha outro.",
        });
      }
      if (findRestrictedNamePattern(shirtName, patterns)) {
        throw new AppError(422, "RESTRICTED_NAME", "Este nome não pode ser utilizado. Escolha outro.", {
          shirtName: "Este nome não pode ser utilizado. Escolha outro.",
        });
      }
      return { shirtName, jerseyNumber };
    }

    if (variant.product_kind === "BUS") {
      if (input && (input.shirtName || input.jerseyNumber)) {
        throw badRequest("INVALID_PRODUCT_CONFIGURATION", "A configuração deste item não é válida.");
      }
      return {};
    }

    if (input && Object.keys(input).length > 0) {
      throw badRequest("INVALID_PRODUCT_CONFIGURATION", "A configuração deste item não é válida.");
    }
    return {};
  }
}
