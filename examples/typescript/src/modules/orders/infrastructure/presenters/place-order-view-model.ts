// Plain data — no methods, no logic. Formatted for consumption by the view / HTTP response.
export interface PlaceOrderViewModel {
  orderId: string;
  statusLabel: string; // 'Pending' (or 'Pendiente') instead of 'PENDING'
  total: string;       // '$25.00' instead of 2500 (cents)
}

export interface PlaceOrderErrorViewModel {
  message: string; // in the request's language
  code: 'CUSTOMER_NOT_FOUND' | 'INVALID_ORDER' | 'UNKNOWN_ERROR';
}
