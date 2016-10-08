
var test_31_x = function(n, steps, exp) {
    var cu = new CounterUnit();
    cu.SetMode(3, 1);
    cu.write_value(n);
    cu.Count(WRITE_DELAY);
    var res = ""; 
    for (var i in steps) {
        res += cu.read_value().toString(16) + " ";
        cu.Count(steps[i]);
    }
    res = res.trim();

    var message = "Mode 3/1, n=" + n + " steps=" + steps.join("") + ": ";
    message += res == exp ? res + " OK" : "Error: exp [" + exp + "] act ["+res+"]";
    console.log(message);
};

// cases from datasheet
test_31_x(4, [1,1,1,1,1,1,1,1,1,1], "4 2 4 2 4 2 4 2 4 2");
test_31_x(5, [1,1,1,1,1,1,1,1,1,1], "5 4 2 5 2 5 4 2 5 2");

test_31_x(4, [2,2,2,2,2,2,2,2,2,2], "4 4 4 4 4 4 4 4 4 4");
test_31_x(5, [2,2,2,2,2,2,2,2,2,2], "5 2 2 4 5 5 2 2 4 5");
// b2m case 
var steps = [];
for(var i = 0; i < 20; i++) { steps[i] = 8; };
test_31_x(9, steps, "9 2 4 6 9 2 4 6 8 9 2 4 6 9 2 4 6 8 9 2");
