// The texts the customers controllers send, by locale. Keys are the codes of domain and application failures.
// The catalog belongs to the module: removing the module removes its texts.
export const customerMessages = {
  en: {
    'INVALID_CUSTOMER.NAME_REQUIRED': 'Customer name must not be empty',
    'INVALID_CUSTOMER.INVALID_EMAIL': 'Customer email is not valid',
    EMAIL_ALREADY_REGISTERED: 'Email {email} is already registered',
    CUSTOMER_NOT_FOUND: 'Customer {customerId} not found',
  },
  es: {
    'INVALID_CUSTOMER.NAME_REQUIRED': 'El nombre del cliente no puede estar vacío',
    'INVALID_CUSTOMER.INVALID_EMAIL': 'El email del cliente no es válido',
    EMAIL_ALREADY_REGISTERED: 'El email {email} ya está registrado',
    CUSTOMER_NOT_FOUND: 'No existe el cliente {customerId}',
  },
};

// What the controllers need to turn a key into text. main/ injects an implementation (platform/i18n).
export type Translate = (locale: string, key: string, params?: Readonly<Record<string, string>>) => string;
