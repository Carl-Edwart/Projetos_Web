import type { ColumnType, JSONColumnType, Selectable } from "kysely";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type BigIntText = string;
type JsonObject = JSONColumnType<Record<string, unknown>, string, string>;

export interface ProductsTable {
  id: string;
  code: string;
  name: string;
  kind: string;
  description: string | null;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductVariantsTable {
  id: string;
  product_id: string;
  variant_code: string;
  display_name: string;
  attributes: JsonObject;
  price_cents: BigIntText;
  currency: string;
  available_quantity: number | null;
  is_available: boolean;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RestrictedNumbersTable {
  number: number;
  is_active: boolean;
  created_at: Timestamp;
}

export interface RestrictedNamePatternsTable {
  id: string;
  category: string;
  normalized_pattern: string;
  is_active: boolean;
  created_at: Timestamp;
}

export interface CheckoutOptionsTable {
  id: string;
  option_type: "class" | "modality";
  value: string;
  label: string;
  is_active: boolean;
  created_at: Timestamp;
}

export interface CheckoutSessionsTable {
  id: string;
  secret_hash: Buffer;
  csrf_hash: Buffer;
  active_order_id: string | null;
  expires_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CustomersTable {
  id: string;
  full_name: string;
  cpf_ciphertext: Buffer;
  rg_ciphertext: Buffer;
  encryption_key_version: number;
  birth_date: string;
  phone_e164: string;
  email: string;
  class_name: string;
  modality: string;
  created_at: Timestamp;
}

export interface OrdersTable {
  id: string;
  public_id: string;
  checkout_session_id: string;
  customer_id: string;
  idempotency_key: string;
  status: string;
  currency: string;
  subtotal_cents: BigIntText;
  total_cents: BigIntText;
  inventory_state: "RESERVED" | "SOLD" | "RELEASED";
  expires_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  paid_at: Timestamp | null;
}

export interface OrderItemsTable {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  variant_code_snapshot: string;
  variant_name_snapshot: string;
  variant_attributes_snapshot: JsonObject;
  customization: JsonObject;
  quantity: number;
  unit_price_cents: BigIntText;
  line_total_cents: BigIntText;
  created_at: Timestamp;
}

export interface PaymentsTable {
  id: string;
  order_id: string;
  provider: string;
  status: string;
  amount_cents: BigIntText;
  currency: string;
  installments: number;
  payment_method_id: string | null;
  external_reference: string;
  client_idempotency_key: string;
  provider_idempotency_key: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  installment_amount_cents: BigIntText | null;
  total_paid_amount_cents: BigIntText | null;
  action_url_ciphertext: Buffer | null;
  error_code: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  settled_at: Timestamp | null;
  last_reconciled_at: Timestamp | null;
}

export interface PaymentEventsTable {
  id: string;
  payment_id: string | null;
  provider: string;
  event_id: string | null;
  resource_id: string;
  action: string | null;
  event_type: string;
  payload_digest: Buffer;
  safe_summary: JsonObject;
  received_at: Timestamp;
  processed_at: Timestamp | null;
  processing_error_code: string | null;
}

export interface Database {
  products: ProductsTable;
  product_variants: ProductVariantsTable;
  restricted_numbers: RestrictedNumbersTable;
  restricted_name_patterns: RestrictedNamePatternsTable;
  checkout_options: CheckoutOptionsTable;
  checkout_sessions: CheckoutSessionsTable;
  customers: CustomersTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  payments: PaymentsTable;
  payment_events: PaymentEventsTable;
}

export type ProductRow = Selectable<ProductsTable>;
export type ProductVariantRow = Selectable<ProductVariantsTable>;
export type CheckoutSessionRow = Selectable<CheckoutSessionsTable>;
export type OrderRow = Selectable<OrdersTable>;
export type OrderItemRow = Selectable<OrderItemsTable>;
export type PaymentRow = Selectable<PaymentsTable>;
