import random

class House:
    def __init__(self, name, worth):
        self.name = name
        self.worth = worth
    
    def turn(self):
        self.worth += self.worth * 0.06

class Car:
    def __init__(self, name, worth, lifepoints, is_cheap, years_old=0):
        self.name = name
        self.worth = worth
        self.lifepoints = lifepoints
        self.years_old = years_old
        self.is_cheap = is_cheap
    
    def turn(self):
        if self.is_cheap:
            self.worth -= 5000
            if self.years_old == 10:
                return False
        else:    
            if self.year_old <=8:
                self.worth -= 5000
            elif self.year_old >=15:
                self.worth += 5000
        self.years_old += 1
        return True
    
    def plus_steps(self):
        if self.is_cheap:
            return 1
        else: 
            return 2

class Player:
    def __init__(self, id, salary=5000, is_married=False, houses=[], cars=[], babies=0, life_points=0, money=0, is_phd=False, is_degree=False):
        self.id = id
        self.salary = salary
        self.is_married = is_married
        self.house = houses
        self.car = cars
        self.babies = babies
        self.life_points = life_points
        self.money = money
        self.is_phd = is_phd
        self.is_degree = is_degree

    def spin(self):
        round_money = self.salary
        round_money -= round_money * min(0.1 * self.babies, 0.4)
        round_money -= round_money * min(0.1 * len(self.car))
        self.money += round_money
        if self.money < 0:
            self.money += self.money * 0.1
        self.life_points += sum([car.lifepoints for car in self.cars])
        self.life_points += len(self.houses) * 100
        if self.is_married:
            self.life_points += 1500
        self.life_points += self.babies * 350
        
        for car in self.cars:
            car.turn()
        for house in self.houses:
            house.turn()
        print(f"Player {self.id} has {self.money} money, {self.life_points} life points .")
        print(f"Player {self.id} has {len(self.houses)} houses, {len(self.cars)} cars.")
        return (random.randint(0, 10) + sum([car.plus_steps() for car in self.cars]))
    
    def change_money(self, money):
        self.money += money

    def change_life_points(self, life_points):
        self.life_points += life_points

class Game:
    def __init__(self, num_players, rounds_left, rounds_done=0):
        self.num_players = num_players
        self.rounds_left = rounds_left
        self.rounds_done = rounds_done
        self.players = [Player(i+1) for i in range(num_players)]
