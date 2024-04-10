################################################################################
#                         WAR CARD GAME
#
# Written by Michael McCarthy
#
#  Classes are:  Card, Deck, Player
#  Main function is the game play
#
#  The computer will play itself and tell you who won
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

	def __init__(self,name,suit,rank):
		self.card = {'name':'','suit':'','rank':0}
		self.card['name'] = name
		self.card['suit'] = suit
		self.card['rank'] = rank
	def printCard(self):
		print(f"{self.card['name']} of {self.card['suit']}")
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
	suits = ('Clubs','Diamonds','Hearts','Spades')
	cards = []
	rank = 0

	def __init__(self):
		# build the deck
		for value in self.card_values:
			self.rank += 1
			for suit in self.suits:
				# create an instance of a new card
				#print(f"Creating {value} of {suit}")
				this_card = Card(value,suit,self.rank)
				self.cards.append(this_card)



	def printDeck(self):
		for i in self.cards:
			i.printCard()

	def dealCard(self):
		return cards.pop(0)

	def count(self):
		return len(self.cards)

	def shuffle(self):
		random.shuffle(self.cards)

	def __len__(self):
		return Len(self.cards)


################################################################################
#						PLAYER
# Each player will have a list of cards that are theres
#
################################################################################
class Player:
	def __init__(self,name):
		self.cards = []		# players cards
		self.player_name = name

	def addCard(self,card):
		self.cards.append(card)    # ADD TO THE BACK OF THE PILE

	def getCard(self):
		return(self.cards.pop(0))   # RETURNS THE TOP CARD OFF THEIR PILE
		# self.cards[0].printCard()

	def printPlayersCards(self):
		for card in self.cards:
			print(f"Card is: {card.getCardName()} of {card.getCardSuit()}")

	def count(self):
		return len(self.cards)

################################################################################
#						PILE
# The pile will be the cards put into the center to play
#
################################################################################
#class Pile:
	def __init__(self):
		self.cards = []		# list of cards in the pile

	def add(self,card):
		self.cards.append(card)



def deal_cards(deck,player1,player2):
	card_count = 0
	for card in deck.cards:
		card_count += 1
		if(card_count%2 == 0):
			# print(f"card_count = {card_count}")
			# print(f"card_count%2 = {card_count % 2}")
			player1.addCard(card)
		else:
			player2.addCard(card)
		

def give_cards_to_winner(player,cards):
	for card in cards:
		player.addCard(card)


# CREATE THE DECK
my_deck = Deck()
print(f"My deck has {my_deck.count()} cards in it")


# my_deck.getCard().printCard()
# print(f"First card's rank is: {my_deck.getCard().getCardRank()}")
# my_deck.printDeck()


# SHUFFLE THE DECK
my_deck.shuffle()

# CREATE THE PLAYERS
player1 = Player()
player2 = Player()

# DEAL THE CARDS
deal_cards(my_deck, player1, player2)


#  PRINT PLAYERS CARDS -- FOR DEBUGGING ONLY
# print player 1's cards
# print(f"PLAYER 1 HAS {player1.count()} CARDS: \n =====================")
# player1.printPlayersCards()

# print player 2's cards
# print(f"PLAYER 2 HAS {player2.count()} CARDS: \n =====================")
# player2.printPlayersCards()

# NEXT ACTIONS

# WHILE EACH PLAYER HAS AT LEAST 1 CARD, PLAY
while(player1.count() > 0 and player2.count() > 0):
	# INITIALIZE THE PILE TO EMPTY
	p1_pile = []
	p2_pile = []
	tie = True

    # LET'S PRINT BOTH PLAYERS CARD COUNT TO SEE WHERE WE ARE
	print("============================================================================")
	print(f"Player 1 has {player1.count()} cards")
	print(f"Player 2 has {player2.count()} cards")
	print("============================================================================")
  

	# THE PLAYER WITH THE HIGHEST CARD RANK WINS
	# THIS PART WILL BE IN A WHILE LOOP TOO IN THE EVENT OF A TIE
	while(tie == True):

		# BOTH PLAYERS PUT THE TOP CARD IN THE HAND ON THE PILE
		# THIS PILE NEEDS TO BE 2 LISTS OF CARDS
		try:
			p1_pile.append(player1.getCard())
			p2_pile.append(player2.getCard())
		except:
			print("WE RAN OUT OF CARDS IN A WAR...WINNER IS THE FIRST PLAYER OUT OF CARDS")
			break

		if(p1_pile[0].getCardRank() > p2_pile[0].getCardRank()):
			print(f"Player 1 has: {p1_pile[0].getCardName()} which beats player 2 who has: {p2_pile[0].getCardName()}")
			give_cards_to_winner(player1,p1_pile + p2_pile)
			tie = False
		elif(p2_pile[0].getCardRank() > p1_pile[0].getCardRank()):
			print(f"Player 2 has: {p2_pile[0].getCardName()} which beats player 1 who has: {p1_pile[0].getCardName()}")
			give_cards_to_winner(player2,p1_pile + p2_pile)
			tie = False
		elif(p2_pile[0].getCardRank() == p1_pile[0].getCardRank()):
			print(f"**************** Both players have: {p1_pile[0].getCardName()} ******************")
			# IF THE CARDS MATCH IN RANK, THEN BOTH PLAYERS PLACE 3 CARDS AT RISK AND TURN OVER A 4TH TO DUAL WITH -- WINNER TAKES ALL
			tie = True
			# DRAW WAR CARDS
			for x in range(0,4):
				print(f"COUNT = {x}")
				try:
					p1_pile.insert(0,player1.getCard())
					p2_pile.insert(0,player2.getCard())
				except:
					print("WE RAN OUT OF CARDS IN A WAR...WINNER IS THE FIRST PLAYER OUT OF CARDS")
					break


# LET'S PRINT BOTH PLAYERS CARD COUNT TO SEE WHERE WE ARE
print("============================================================================")
print(f"Player 1 has {player1.count()} cards")
print(f"Player 2 has {player2.count()} cards")
print("============================================================================")

if(player1.count() == 0):
	print("PLAYER 1 WINS THE WAR!!!!")
elif(player2.count() == 0):
	print("PLAYER 2 WINS THE WAR!!!!")

	# IF WE HAVE A TIE, EACH PLAYER PUTS 3 MORE CARDS IN THE PILE AND THEN TURNS OVER 1 MORE CARD TO SEE WHO WINS

	# PLAY ENDS WHEN SOMEONE RUNS OUT OF CARDS


##################################
# ISSUES:
#
#  1) If someone runs out of cards during a war, there is an exception
#      FIXED: wrapped an exception handler around it with a break if we run out of cards
#
#
##################################



