import { asyncHandler } from "../utils/Asynchandler.js";
import {User} from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from 'mongoose';


const generateAccessAndRefereshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token")
    }
}

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken || req.query.refreshToken;
    if (!incomingRefreshToken) {
        throw new ApiError(401, "Please login first");
    }
    try{
        const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user= await User.findById(decoded._id);
        if(!user){
            throw new ApiError(401, "User not found");
        }
        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401, "Invalid refresh token");
        }
        const option={
            httpOnly:true,
            secure:true
        }
        const {accessToken, refreshToken} = await generateAccessAndRefereshTokens(user._id);
        return res
            .status(200)
            .cookie("accessToken", accessToken, option)
            .cookie("refreshToken", refreshToken, option)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: { _id: user._id, name: user.name, email: user.email },
                        accessToken,
                        refreshToken
                    },
                    "Access token refreshed successfully"
                )
            );

    }catch(error){
        throw new ApiError(500, "Something went wrong while refreshing access token");
    }
})

const RegisterUser = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  if ([name, email, password].some((field) => typeof field !== "string" || field.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    email: email.trim().toLowerCase(),
  });

  if (existedUser) {
    throw new ApiError(400, "User already exists with this email");
  }

  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: password.trim(),
  });

  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  if (!createdUser) {
    throw new ApiError(500, "User not created");
  }

  return res.status(201).json(
    new ApiResponse(201, "User created successfully", createdUser)
  );
});

const loginUser= asyncHandler(async(req,res,next)=>{
    const {email, password}= req.body;

    if([email, password].some((field)=> typeof field !== "string" || field.trim() === "")){
        throw new ApiError(400, "All fields are required");
    }

    const user= await User.findOne({
        email: email.trim().toLowerCase()
    });

    if(!user){
        throw new ApiError(400, "User does not exist with this email");
    }

    const isPasswordCorrect= await user.isPasswordCorrect(password);

    if(!isPasswordCorrect){
        throw new ApiError(400, "Incorrect password");
    }

    
    const {accessToken, refreshToken} = await generateAccessAndRefereshTokens(user._id);

    const userData = await User.findById(user._id).select("-password -refreshToken");
    const option={
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, option)
    .cookie("refreshToken", refreshToken, option)
    .json(
        new ApiResponse(
            200, 
            {
                user: userData, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )
})

const logoutUser = asyncHandler(async (req, res, next) => {
    await User.findByIdAndUpdate(req.user._id, { 
        $unset:{refreshToken: 1}
    },
    {
        new: true
    }
)
const option={
    httpOnly:true,
    secure:true
}
return res
    .status(200)
    .clearCookie("accessToken", option)
    .clearCookie("refreshToken", option)
    .json(new ApiResponse(200, {}, "User logged Out"))

})
export {RegisterUser,loginUser, refreshAccessToken, logoutUser };
