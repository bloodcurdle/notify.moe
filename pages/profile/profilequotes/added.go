package profilequotes

import (
	"github.com/aerogo/aero"
	"github.com/animenotifier/arn"
)

// Added shows all quotes added by a particular user.
func Added(ctx *aero.Context) string {
	return render(ctx, addedQuotes)
}

// addedQuotes returns all quotes that the user with the given user ID published.
func addedQuotes(userID string) []*arn.Quote {
	return arn.FilterQuotes(func(quote *arn.Quote) bool {
		return !quote.IsDraft && len(quote.Text.English) > 0 && quote.CreatedBy == userID
	})
}
