package bootstrap

import (
	"database/sql"

	customersinteractors "example.com/shop/internal/modules/customers/application/interactors"
	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	customersoutput "example.com/shop/internal/modules/customers/application/ports/output"
	customerscontrollers "example.com/shop/internal/modules/customers/infrastructure/controllers"
	customersgateways "example.com/shop/internal/modules/customers/infrastructure/gateways"
	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/i18n"
)

var customersMigrations = db.Migration{Module: "customers", Files: customersgateways.Migrations}

type customersModule struct {
	GetCustomer      customersinput.GetCustomer // the input port other modules may use
	RegisterCustomer *customerscontrollers.RegisterCustomer
	GetController    *customerscontrollers.GetCustomer
}

func composeCustomers(repo customersoutput.CustomerRepository, newID func() string, defaultLocale string) customersModule {
	getCustomer := customersinteractors.NewGetCustomer(repo)
	t := i18n.New(customerscontrollers.Messages, defaultLocale)
	return customersModule{
		GetCustomer:      getCustomer,
		RegisterCustomer: customerscontrollers.NewRegisterCustomer(customersinteractors.NewRegisterCustomer(repo, newID), t),
		GetController:    customerscontrollers.NewGetCustomer(getCustomer, t),
	}
}

func sqlCustomers(conn *sql.DB) customersoutput.CustomerRepository {
	return customersgateways.NewSQLCustomerRepository(conn)
}
