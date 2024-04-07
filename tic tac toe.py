from IPython.display import clear_output
import math

print ("Welcome to Tic Tac Toe")

board= [' ',' ',' '],[' ',' ',' '],[' ',' ',' ']


def print_board():
	clear_output()
	print('========')
	print(f'|{board[0][0]}|{board[0][1]}|{board[0][2]}|')
	print('========')
	print(f'|{board[1][0]}|{board[1][1]}|{board[1][2]}|')
	print('========')
	print(f'|{board[2][0]}|{board[2][1]}|{board[2][2]}|')
	print('========')

#################################################################
# 
# Get user input and validate input before returning
# 
#################################################################
def get_input(player):
	move_valid = False

	while(not move_valid):
		print(f'It is {player}s turn.  Please select a square (1-9):')
		move = input()


		if(not move.isdigit()):
			print("Input invalid.  Please select an integer between 1 and 9:")
			move_valid = False
			continue
	
		move_int = int(move)

		print(f'You have selected {move_int}')
		row = math.floor((move_int-1)/3)
		col = (move_int-1)%3
		print(f'Row:{row}, Column:{col}')

		print(type(move_int))

		# Check to see if move is within range
		# if(move_int>=1 and move_int<=9):
		if(move_int<=0 or move_int>=10):
			print(f'Your move is not within range. Try again.')
			move_valid = False
			continue

		#Debug statement
		#print(f'This square is currently: {board[row][col]}')

		# Check to see if this square is taken
		if(board[row][col] != ' '):
			print(f'Square {move} is taken.')
			move_valid = False
			continue

		# Move is valid
		print(f'Your move of {move} is valid')
		move_valid = True
		return[row,col]


def winner_test(player):
	# test horizontal winner
	for x in range(0,3):
		if(board[x][0] == board[x][1] == board[x][2] == player):
			return True

	# test vertical winner
	for x in range(0,3):
		if(board[0][x] == board[1][x] == board[2][x] == player):
			return True

	# test diagonal winner
	if(board[0][0] == board[1][1] == board[2][2] == player):
		return True
	if(board[0][2] == board[1][1] == board[2][0] == player):
		return True


# Primary Loop

for turn in range(0,9):
	print(f'Turn {turn}:')
	# Which player
	if(turn%2 == 0):
		player = "X"
	else:
		player = "O"

	# Print out the board
	print_board()

	# Get user input
	[row,col] = get_input(player)


	# Update Board
	print(f'Row: {row}  Column: {col}')
	board[row][col] = player

	print('NEW BOARD')
	print_board()

	# Check to see if we have a winner -- if so, exit
	if(winner_test(player) == True):
		print(f"WINNER WINNER CHICKEN DINNER. PLAYER {player} WINS!!!!!")
		exit()

	# Check if game is over -- if so, exit
	# Game will automatically end after 9 moves as a stalemate if no winner

# GAME OVER
print('GAME OVER - RESULT=STALEMATE')