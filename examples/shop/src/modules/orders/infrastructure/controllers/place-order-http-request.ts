// HTTP-specific DTO: the body exactly as it arrives. The use case request uses its own vocabulary (`lines`).
export interface PlaceOrderHttpRequest {
  customerId: string;
  items: { productId: string; quantity: number; unitPriceCents: number }[];
}
