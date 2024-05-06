class House {
    constructor(name, worth) {
        this.name = name;
        this.worth = worth;
    }

    turn() {
        this.worth += this.worth * 0.06;
    }
}

class Car {
    constructor(name, worth, lifepoints, is_cheap, years_old = 0) {
        this.name = name;
        this.worth = worth;
        this.lifepoints = lifepoints;
        this.years_old = years_old;
        this.is_cheap = is_cheap;
    }

    turn() {
        if (this.is_cheap) {
            this.worth -= 5000;
            if (this.years_old == 10) {
                return false;
            }
        } else {
            if (this.years_old <= 8) {
                this.worth -= 5000;
            } else if (this.years_old >= 15) {
                this.worth += 5000;
            }
        }
        this.years_old += 1;
        return true;
    }

    plus_steps() {
        if (this.is_cheap) {
            return 1;
        } else {
            return 2;
        }
    }
}

class Player {
    constructor(id, salary = 5000, is_married = false, houses = [], cars = [], babies = 0, life_points = 0, money = 0, is_phd = false, is_degree = false) {
        this.id = id;
        this.salary = salary;
        this.is_married = is_married;
        this.houses = houses;
        this.cars = cars;
        this.babies = babies;
        this.life_points = life_points;
        this.money = money;
        this.is_phd = is_phd;
        this.is_degree = is_degree;
    }

    spin() {
        let round_money = this.salary;
        round_money -= round_money * Math.min(0.1 * this.babies, 0.4);
        round_money -= round_money * Math.min(0.1 * this.cars.length, 0.4);
        this.money += round_money;
        if (this.money < 0) {
            this.money += this.money * 0.1;
        }
        this.life_points += this.cars.reduce((sum, car) => sum + car.lifepoints, 0);
        this.life_points += this.houses.length * 100;
        if (this.is_married) {
            this.life_points += 1500;
        }
        this.life_points += this.babies * 350;

        this.cars.forEach(car => car.turn());
        this.houses.forEach(house => house.turn());
        console.log(`Player ${this.id} has ${this.money} money, ${this.life_points} life points .`);
        console.log(`Player ${this.id} has ${this.houses.length} houses, ${this.cars.length} cars.`);
        return (Math.floor(Math.random() * 11) + this.cars.reduce((sum, car) => sum + car.plus_steps(), 0));
    }

    change_money(money) {
        this.money += money;
    }

    change_life_points(life_points) {
        this.life_points += life_points;
    }
}

class Game {
    constructor(num_players, rounds_left, rounds_done = 0) {
        this.num_players = num_players;
        this.rounds_left = rounds_left;
        this.rounds_done = rounds_done;
        this.players = Array.from({ length: num_players }, (_, i) => new Player(i + 1));
    }
}

document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', function () {
        const screen = document.querySelector('.screen');
        screen.textContent = this.textContent;
    });
});

