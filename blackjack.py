################################################################################
#                         BLACKJACK
#
# Written by Michael McCarthy
#
#  Classes are:  Card, Deck, PlayerBase, Hand
#  Subclasses:  From PlayerBase, we will create a player and a dealer that play 
#  				their hands differently
#  
#
#  The player will be a the user and decide via input how to play their hand
#  The dealer will play automatically based on pre-set rules in thie program
#
#################################################################################

import random

################################################################################
#					CARD
#
# This class contains a single instance of a card with the name, rank and suit #
#
################################################################################
class Card:
	# caution....any attributes I define here are "class atrributes" and will be updated for all instances
	# of this class...not just a single instance
	# In order for the attributes to be part of the instance, they need to be instantiated in the __init__ class

	def __init__(self,name,suit,rank):
		self.card = {'name':'','suit':'','rank':0}
		self.card['name'] = name
		self.card['suit'] = suit
		self.card['rank'] = rank
	def printCard(self):
		print(f"{self.card['name']} of {self.card['suit']}")
		# print(f"Value of:{self.card['rank']}")

	def __str__(self):
		return(self.card['name'] + " of " + self.card['suit'])
		# print(f"Value of:{self.card['rank']}")

	def getCardName(self):
		return self.card['name']

	def getCardSuit(self):
		return self.card['suit']

	def getCardRank(self):
		return self.card['rank']


################################################################################
#						DECK
# This class contains the entire deck of play
#
################################################################################
class Deck:
	card_values = ('2','3','4','5','6','7','8','9','10','Jack','Queen','King','Ace')
	card_ranks = (2,3,4,5,6,7,8,9,10,10,10,10,1)
	suits = ('Clubs','Diamonds','Hearts','Spades')

	rank = 0

	def __init__(self):
		# build the deck
		self.cards = []
		for value in self.card_values:
			for suit in self.suits:
				# create an instance of a new card
				# print(f"Creating {value} of {suit}")
				this_card = Card(value,suit,self.card_ranks[self.rank])
				self.cards.append(this_card)
			self.rank += 1



	def printDeck(self):
		for i in self.cards:
			# i.printCard()
			print(i)

	def dealCard(self):
		return self.cards.pop(0)

	def count(self):
		return len(self.cards)

	def shuffle(self):
		# self.cards = []
		random.shuffle(self.cards)

	def __len__(self):
		return Len(self.cards)


################################################################################
#						PLAYER
# Player is the base class for all card players
#
################################################################################
class Player:
	def __init__(self,name):
		self.cards = []		# players cards
		self.player_name = name


	def addCard(self,card):
		self.cards.append(card)    # TAKE A CARD

	def getLastCard(self):
		return self.cards[-1]

	def printPlayersCards(self):
		for card in self.cards:
			print(card)

	def count(self):
		return len(self.cards)

	def cardCount(self):
		# CARD COUNT IN BLACKJACK IS UNIQUE BC AN ACE CAN COUNT AS A 1 OR AN 11
		# HOW CAN I IMPLEMENT THIS:
		#    1) COUNT ALL ACES AS 1 TO START. IF COUNT <= 10 AND I HAVE AN ACE, COUNT = COUNT + 11
		#			THIS WILL WORK BC YOU CAN ONLY HAVE A MAX OF 1 ACE IN YOUR HAND THAT COUNTS AS 11
		#    2) I COULD SORT THE CARDS HIGHEST TO LOWEST.  WHEN IT COMES TO COUNTING THE ACES, COUNT AS 11 UNLESS I BUST
		#		THIS WON'T WORK IF I HAVE MULTIPLE ACES
		count = 0
		# BASIC COUNT FIRST
		for card in self.cards:
			count += card.getCardRank()
		# NOW LET'S SEE IF WE HAVE AN ACE -- IF WE DO, WE ADD 10 TO OUR COUNT IF THAT DOESN'T MAKE US BUST
		if(count<=11):
			if(self.doIHaveAnAce()):
				count += 10
		return count

	def clearPlayersCards(self):
		self.cards = []   # EMPTY THE PLAYERS HAND

	def getPlayerName(self):
		return self.player_name

	def doIHaveAnAce(self):
		for card in self.cards:
			if(card.getCardName() == "Ace"):
				return True
		return False




################################################################################
#						BLACKJACKPLAYER
# Blackjack Player - extends player with a new method hitOrStand()
#
################################################################################
class BlackJackPlayer(Player):

	def __init__(self,name,starting_bank_roll):
		self.cards = []		# players cards
		self.player_name = name
		self.bank_roll = starting_bank_roll

	def hitOrStand(self):
		# PLAYER WILL DECIDE IN REAL TIME HOW THEY WANT TO PLAY THIS HAND
		# OPTIONS ARE 'h' TO TAKE ANOTHER CARD OR 's' TO STAND
		print("Player 1:  Please press 'h' to hit(take a card) or 's' to stand(no more cards)")
		invalid_response = True
		while(invalid_response):
			response = input()
			if(response == 'h' or response == 's'):
				invalid_response = False
			else:
				invalid_response = True
		return response

	def getBankRoll(self):
		return self.bank_roll

	def updateBankRoll(self,updated_bank_roll):
		self.bank_roll = updated_bank_roll

################################################################################
#						DEALER
# Dealer extends player with new method hitOrStand
#
################################################################################
class Dealer(Player):
	def hitOrStand(self,bjPlayersCardCount):
		if(self.cardCount() <= bjPlayersCardCount):
			return("h")
		else:
			return("s")




def deal_cards(deck,player,dealer):
	# 2 CARDS TO EACH PLAYER
	for i in range(0,2):
		player.addCard(deck.dealCard())
		dealer.addCard(deck.dealCard())
		

def pay_winner(player):
	player.payWinner()

###############################################################################
#
#     BEGIN GAME LOGIC
#
################################################################################


# CREATE THE PLAYER AND THE DEALER
player = BlackJackPlayer("Mike",1000)	# PLAYER GETS $1,000 TO START
dealer = Dealer("Dealer")


play_continues = True
# MAIN PLAY LOOP - PLAY CONTINUES UNTIL PLAYER GOES BUST OR DECIDES TO LEAVE THE GAME
while(play_continues):
	print("")
	print("")
	print("############################ NEW HAND ################################")
	print(f"Players Bankroll is: ${player.getBankRoll()}")
	print("######################################################################")

	# PLACE YOUR BET
	print(f"Enter your bet amount between $1 and {player.getBankRoll()}")
	bet = int(input())
	while(bet < 1 or bet > player.getBankRoll()):
		bet = int(input())

	# CREATE THE DECK
	my_deck = Deck()
	# print(f"My deck has {my_deck.count()} cards in it")
	print("######################## SHUFFLING THE DECK ##########################")

	# SHUFFLE THE DECK
	my_deck.shuffle()
	# print(my_deck.printDeck())

	# CLEAR PLAYER AND DEALERS HANDS
	player.clearPlayersCards()
	dealer.clearPlayersCards()

	# DEAL THE CARDS
	deal_cards(my_deck, player, dealer)

	# LETS SEE WHAT EACH PLAYER HAS
	print("***************** Dealer's Hand ************************")
	dealer.printPlayersCards()
	print(f"{dealer.getPlayerName()} has: {dealer.cardCount()}")
	print("***************** Mike's Hand ************************")
	player.printPlayersCards()
	print(f"{player.getPlayerName()} has: {player.cardCount()}")

	# PLAYER GOES FIRST
	turn = True
	while(turn):
		play = player.hitOrStand()
		if(play == "s"):
				turn = False
		else:
			# PLAYER TAKES ANOTHER CARD
			player.addCard(my_deck.dealCard())
			print(f"Player gets:  {player.getLastCard()}")
			print(f"{player.getPlayerName()} has: {player.cardCount()}")
			if(player.cardCount() > 21):
				turn = False

	if(player.cardCount() > 21):
		# PLAYER BUSTS - GAME OVER
		print(f"Player has {player.cardCount()} - GAME OVER -- PLAYER BUSTS ")
		player.updateBankRoll(player.getBankRoll() - bet)
	else:
		# DEALERS TURN
		turn = True
		while(turn):
			play = dealer.hitOrStand(player.cardCount())
			if(play == "s"):
					turn = False
			else:
				# DEALER TAKES ANOTHER CARD
				dealer.addCard(my_deck.dealCard())
				print(f"Dealer gets:  {dealer.getLastCard()}")
				print(f"{dealer.getPlayerName()} has: {dealer.cardCount()}")
				if(dealer.cardCount() > 21):
					turn = False

		# IF THE DEALER BUSTS = PLAYER WINS -- GAME OVER
		if(dealer.cardCount() > 21):
			# DEALER BUSTS - GAME OVER
			print(f"Dealer has {dealer.cardCount()} - GAME OVER -- DEALER BUSTS -- PLAYER WINS ")
			player.updateBankRoll(player.getBankRoll() + bet)
		else:
			# IF THE DEALER DID NOT BUST, THEN WE SEE WHO HAS THE BEST HAND
			if(player.cardCount() > dealer.cardCount()):
				# PLAYER WINS
				print("PLAYER WINS")
				player.updateBankRoll(player.getBankRoll() + bet)
			elif(player.cardCount() < dealer.cardCount()):
				# DEALER WINS
				print("DEALER WINS")
				player.updateBankRoll(player.getBankRoll() - bet)
			else:
				# BOTH PLAYER AND DEALER HAVE THE SAME COUNT == PUSH
				print("PUSH")

	if(player.getBankRoll() <= 0):
		# OUT OF MONEY == GAME OVER
		print("OUT OF MONEY == GAME OVER")
		break

	# SHOULD WE PLAY AGAIN
	print("Would you like to play again y/n?")
	play_again = input()
	while(play_again != "y" and play_again != "n"):
		play_again = input()