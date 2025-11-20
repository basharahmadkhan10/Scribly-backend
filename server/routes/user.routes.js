import { Router } from 'express';
import { RegisterUser, loginUser, logoutUser} from '../controllers/user.controller.js'; 
import { verifyJWT } from './middlewares/auth.middlewares.js'; 

const router= Router();

router.route("/register").post(RegisterUser);
router.route("/login").post(loginUser);
// secure route
router.route("/logout").post(verifyJWT,logoutUser);

export default router
